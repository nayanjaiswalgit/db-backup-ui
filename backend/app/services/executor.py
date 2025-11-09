"""
Remote execution service for SSH, Docker, and Kubernetes
"""
import asyncio
import logging
from typing import Dict, Any, Optional, List
from enum import Enum
import paramiko
import docker
from kubernetes import client, config
from io import StringIO
import shlex

from app.models.server import ServerType
from app.core.security import decrypt_data
from app.core.validation import (
    validate_hostname,
    validate_port,
    validate_container_name,
    validate_namespace,
    ValidationError
)

logger = logging.getLogger(__name__)


class ExecutionResult:
    """Execution result container"""
    def __init__(self, success: bool, stdout: str = "", stderr: str = "", exit_code: int = 0):
        self.success = success
        self.stdout = stdout
        self.stderr = stderr
        self.exit_code = exit_code


class SSHExecutor:
    """Execute commands via SSH"""

    def __init__(self, host: str, port: int, credentials: Dict[str, Any]):
        # Validate inputs to prevent injection attacks
        try:
            self.host = validate_hostname(host)
            self.port = validate_port(port or 22)
        except ValidationError as e:
            logger.error(f"Invalid SSH parameters: {e}")
            raise ValueError(f"Invalid SSH parameters: {e}")

        self.username = credentials.get("username")
        self.password = credentials.get("password")
        self.ssh_key = credentials.get("ssh_key")
        self.client = None

    async def connect(self) -> bool:
        """Establish SSH connection"""
        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            if self.ssh_key:
                # Use SSH key authentication
                key_file = StringIO(self.ssh_key)
                pkey = paramiko.RSAKey.from_private_key(key_file)
                await asyncio.to_thread(
                    self.client.connect,
                    self.host,
                    port=self.port,
                    username=self.username,
                    pkey=pkey,
                    timeout=10
                )
            else:
                # Use password authentication
                await asyncio.to_thread(
                    self.client.connect,
                    self.host,
                    port=self.port,
                    username=self.username,
                    password=self.password,
                    timeout=10
                )

            logger.info(f"SSH connection established to {self.host}")
            return True

        except Exception as e:
            logger.error(f"SSH connection failed to {self.host}: {e}")
            return False

    def _validate_command(self, command: str) -> None:
        """
        Validate command for security.
        Whitelist approach for allowed commands.
        """
        if not command or not command.strip():
            raise ValidationError("Command cannot be empty")

        # Whitelist of allowed command prefixes for DB backup operations
        allowed_prefixes = [
            'pg_dump', 'pg_restore', 'pg_basebackup', 'psql',
            'mysqldump', 'mysql',
            'mongodump', 'mongorestore',
            'redis-cli',
            'tar', 'gzip', 'gunzip', 'zstd', 'lz4',
            'cat', 'ls', 'mkdir', 'rm', 'cp', 'mv',
            'du', 'df', 'which', 'echo', 'test',
        ]

        command_base = command.strip().split()[0]

        # Check if command starts with allowed prefix
        if not any(command_base.startswith(prefix) for prefix in allowed_prefixes):
            logger.warning(f"Command not in whitelist: {command_base}")
            raise ValidationError(f"Command not allowed: {command_base}")

        # Check for command chaining attempts
        dangerous_patterns = [';', '|', '&', '\n', '\r', '$(', '`']
        # Allow pipes for specific safe cases like pg_dump | gzip
        safe_pipes = ['gzip', 'gunzip', 'zstd', 'lz4']
        if '|' in command:
            parts = command.split('|')
            for part in parts[1:]:  # Check piped commands
                piped_cmd = part.strip().split()[0]
                if not any(piped_cmd.startswith(safe) for safe in safe_pipes):
                    raise ValidationError(f"Unsafe pipe command: {piped_cmd}")

        # Check for other dangerous patterns
        for pattern in [';', '&', '\n', '\r', '$(', '`']:
            if pattern in command:
                raise ValidationError(f"Command contains dangerous pattern: {pattern}")

    async def execute(self, command: str, timeout: int = 300) -> ExecutionResult:
        """Execute command via SSH with security validation"""
        # Validate command before execution
        try:
            self._validate_command(command)
        except ValidationError as e:
            logger.error(f"Command validation failed: {e}")
            return ExecutionResult(False, stderr=f"Command validation failed: {e}")

        if not self.client:
            if not await self.connect():
                return ExecutionResult(False, stderr="Connection failed")

        try:
            logger.info(f"Executing SSH command: {command[:100]}...")  # Log first 100 chars

            stdin, stdout, stderr = await asyncio.to_thread(
                self.client.exec_command,
                command,
                timeout=timeout
            )

            stdout_text = await asyncio.to_thread(stdout.read)
            stderr_text = await asyncio.to_thread(stderr.read)
            exit_code = stdout.channel.recv_exit_status()

            return ExecutionResult(
                success=exit_code == 0,
                stdout=stdout_text.decode(),
                stderr=stderr_text.decode(),
                exit_code=exit_code
            )

        except Exception as e:
            logger.error(f"SSH command execution failed: {e}")
            return ExecutionResult(False, stderr=str(e))

    async def upload_file(self, local_path: str, remote_path: str) -> bool:
        """Upload file via SFTP"""
        try:
            sftp = await asyncio.to_thread(self.client.open_sftp)
            await asyncio.to_thread(sftp.put, local_path, remote_path)
            await asyncio.to_thread(sftp.close)
            return True
        except Exception as e:
            logger.error(f"File upload failed: {e}")
            return False

    async def download_file(self, remote_path: str, local_path: str) -> bool:
        """Download file via SFTP"""
        try:
            sftp = await asyncio.to_thread(self.client.open_sftp)
            await asyncio.to_thread(sftp.get, remote_path, local_path)
            await asyncio.to_thread(sftp.close)
            return True
        except Exception as e:
            logger.error(f"File download failed: {e}")
            return False

    def close(self):
        """Close SSH connection"""
        if self.client:
            self.client.close()


class DockerExecutor:
    """Execute commands in Docker containers"""

    def __init__(self, host: str, credentials: Dict[str, Any]):
        # Validate host
        try:
            self.host = validate_hostname(host) if host != "localhost" else "localhost"
        except ValidationError as e:
            logger.error(f"Invalid Docker host: {e}")
            raise ValueError(f"Invalid Docker host: {e}")

        base_url = f"tcp://{host}:2375" if host != "localhost" else "unix://var/run/docker.sock"
        self.client = docker.DockerClient(base_url=base_url)

    def _validate_command(self, command: str) -> None:
        """Validate Docker exec command"""
        if not command or not command.strip():
            raise ValidationError("Command cannot be empty")

        # Similar whitelist as SSH but for Docker context
        allowed_prefixes = [
            'pg_dump', 'pg_restore', 'psql',
            'mysqldump', 'mysql',
            'mongodump', 'mongorestore',
            'redis-cli',
            'tar', 'gzip', 'gunzip', 'zstd', 'lz4',
            'cat', 'ls', 'echo', 'sh', 'bash',  # sh/bash needed for Docker exec
        ]

        if isinstance(command, str):
            command_base = command.strip().split()[0]
        elif isinstance(command, list):
            command_base = command[0] if command else ""
        else:
            raise ValidationError("Invalid command format")

        if not any(command_base.startswith(prefix) for prefix in allowed_prefixes):
            raise ValidationError(f"Command not allowed: {command_base}")

        # Check for dangerous patterns in string commands
        if isinstance(command, str):
            for pattern in [';', '&', '\n', '\r', '$(', '`']:
                if pattern in command and pattern != '|':  # Allow pipes for compression
                    raise ValidationError(f"Command contains dangerous pattern: {pattern}")

    async def execute(self, container: str, command: str) -> ExecutionResult:
        """Execute command in Docker container with validation"""
        # Validate container name
        try:
            validate_container_name(container)
            self._validate_command(command)
        except ValidationError as e:
            logger.error(f"Docker validation failed: {e}")
            return ExecutionResult(False, stderr=f"Validation failed: {e}")

        try:
            logger.info(f"Executing Docker command in {container}: {str(command)[:100]}...")

            container_obj = await asyncio.to_thread(
                self.client.containers.get,
                container
            )

            result = await asyncio.to_thread(
                container_obj.exec_run,
                command
            )

            return ExecutionResult(
                success=result.exit_code == 0,
                stdout=result.output.decode() if result.output else "",
                exit_code=result.exit_code
            )

        except docker.errors.NotFound:
            return ExecutionResult(False, stderr=f"Container {container} not found")
        except Exception as e:
            logger.error(f"Docker command execution failed: {e}")
            return ExecutionResult(False, stderr=str(e))

    async def list_containers(self) -> List[Dict[str, Any]]:
        """List all containers"""
        try:
            containers = await asyncio.to_thread(self.client.containers.list, all=True)
            return [
                {
                    "id": c.id[:12],
                    "name": c.name,
                    "status": c.status,
                    "image": c.image.tags[0] if c.image.tags else c.image.id
                }
                for c in containers
            ]
        except Exception as e:
            logger.error(f"Failed to list containers: {e}")
            return []

    async def copy_from_container(self, container: str, src_path: str, dest_path: str) -> bool:
        """Copy file from container"""
        try:
            container_obj = await asyncio.to_thread(self.client.containers.get, container)
            bits, stat = await asyncio.to_thread(container_obj.get_archive, src_path)

            with open(dest_path, 'wb') as f:
                for chunk in bits:
                    f.write(chunk)
            return True
        except Exception as e:
            logger.error(f"Failed to copy from container: {e}")
            return False


class KubernetesExecutor:
    """Execute commands in Kubernetes pods"""

    def __init__(self, kubeconfig_path: Optional[str] = None):
        try:
            if kubeconfig_path:
                config.load_kube_config(config_file=kubeconfig_path)
            else:
                config.load_incluster_config()

            self.core_v1 = client.CoreV1Api()
            self.apps_v1 = client.AppsV1Api()
        except Exception as e:
            logger.error(f"Failed to initialize Kubernetes client: {e}")
            raise

    def _validate_command(self, command: List[str]) -> None:
        """Validate Kubernetes exec command"""
        if not command or not isinstance(command, list):
            raise ValidationError("Command must be a non-empty list")

        # Whitelist allowed commands
        allowed_prefixes = [
            'pg_dump', 'pg_restore', 'psql',
            'mysqldump', 'mysql',
            'mongodump', 'mongorestore',
            'redis-cli',
            'tar', 'gzip', 'gunzip', 'zstd', 'lz4',
            'cat', 'ls', 'echo', 'sh', 'bash',
        ]

        command_base = command[0]
        if not any(command_base.startswith(prefix) for prefix in allowed_prefixes):
            raise ValidationError(f"Command not allowed: {command_base}")

        # Check command arguments for injection attempts
        for arg in command:
            for pattern in [';', '&', '$(', '`', '\n', '\r']:
                if pattern in str(arg):
                    raise ValidationError(f"Command argument contains dangerous pattern: {pattern}")

    async def execute(
        self,
        namespace: str,
        pod: str,
        command: List[str],
        container: Optional[str] = None
    ) -> ExecutionResult:
        """Execute command in Kubernetes pod with validation"""
        # Validate inputs
        try:
            validate_namespace(namespace)
            self._validate_command(command)
            if container:
                validate_container_name(container)
        except ValidationError as e:
            logger.error(f"Kubernetes validation failed: {e}")
            return ExecutionResult(False, stderr=f"Validation failed: {e}")

        try:
            from kubernetes.stream import stream

            logger.info(f"Executing K8s command in {namespace}/{pod}: {command}")

            resp = await asyncio.to_thread(
                stream,
                self.core_v1.connect_get_namespaced_pod_exec,
                pod,
                namespace,
                command=command,
                container=container,
                stderr=True,
                stdin=False,
                stdout=True,
                tty=False
            )

            return ExecutionResult(
                success=True,
                stdout=resp
            )

        except client.exceptions.ApiException as e:
            logger.error(f"Kubernetes command execution failed: {e}")
            return ExecutionResult(False, stderr=str(e))

    async def list_pods(self, namespace: str = "default") -> List[Dict[str, Any]]:
        """List pods in namespace"""
        try:
            pods = await asyncio.to_thread(
                self.core_v1.list_namespaced_pod,
                namespace
            )

            return [
                {
                    "name": pod.metadata.name,
                    "namespace": pod.metadata.namespace,
                    "status": pod.status.phase,
                    "ip": pod.status.pod_ip
                }
                for pod in pods.items
            ]
        except Exception as e:
            logger.error(f"Failed to list pods: {e}")
            return []

    async def copy_from_pod(
        self,
        namespace: str,
        pod: str,
        src_path: str,
        dest_path: str,
        container: Optional[str] = None
    ) -> bool:
        """Copy file from pod"""
        try:
            # Use kubectl cp equivalent
            command = ["cat", src_path]
            result = await self.execute(namespace, pod, command, container)

            if result.success:
                with open(dest_path, 'w') as f:
                    f.write(result.stdout)
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to copy from pod: {e}")
            return False


class ExecutorFactory:
    """Factory for creating executors based on server type"""

    @staticmethod
    async def create_executor(
        server_type: ServerType,
        host: str,
        port: Optional[int],
        credentials_encrypted: str
    ):
        """Create appropriate executor based on server type"""
        from app.core.security import decrypt_dict
        import json

        # Decrypt credentials
        credentials = decrypt_dict(json.loads(credentials_encrypted))

        if server_type == ServerType.BARE_METAL:
            return SSHExecutor(host, port, credentials)
        elif server_type == ServerType.DOCKER:
            return DockerExecutor(host, credentials)
        elif server_type == ServerType.KUBERNETES:
            kubeconfig = credentials.get("kubeconfig_path")
            return KubernetesExecutor(kubeconfig)
        else:
            raise ValueError(f"Unsupported server type: {server_type}")
