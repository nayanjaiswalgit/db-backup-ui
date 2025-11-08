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

from app.models.server import ServerType
from app.core.security import decrypt_data

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
        self.host = host
        self.port = port or 22
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

    async def execute(self, command: str, timeout: int = 300) -> ExecutionResult:
        """Execute command via SSH"""
        if not self.client:
            if not await self.connect():
                return ExecutionResult(False, stderr="Connection failed")

        try:
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
        self.host = host
        base_url = f"tcp://{host}:2375" if host != "localhost" else "unix://var/run/docker.sock"
        self.client = docker.DockerClient(base_url=base_url)

    async def execute(self, container: str, command: str) -> ExecutionResult:
        """Execute command in Docker container"""
        try:
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

    async def execute(
        self,
        namespace: str,
        pod: str,
        command: List[str],
        container: Optional[str] = None
    ) -> ExecutionResult:
        """Execute command in Kubernetes pod"""
        try:
            from kubernetes.stream import stream

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
