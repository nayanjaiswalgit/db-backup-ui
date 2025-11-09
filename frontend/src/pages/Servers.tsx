import { useState } from 'react'
import { Plus, Server as ServerIcon, RefreshCw, Trash2, Edit, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

interface Server {
  id: number
  name: string
  host: string
  type: 'ssh' | 'docker' | 'kubernetes'
  environment: 'production' | 'staging' | 'development'
  status: 'healthy' | 'unhealthy' | 'unknown'
  lastHeartbeat: string
  databases: number
}

// Mock data for demonstration
const mockServers: Server[] = [
  {
    id: 1,
    name: 'Production DB Server',
    host: 'prod-db-01.example.com',
    type: 'ssh',
    environment: 'production',
    status: 'healthy',
    lastHeartbeat: '2025-11-09T10:30:00Z',
    databases: 5,
  },
  {
    id: 2,
    name: 'Staging PostgreSQL',
    host: 'staging-postgres.example.com',
    type: 'docker',
    environment: 'staging',
    status: 'healthy',
    lastHeartbeat: '2025-11-09T10:29:00Z',
    databases: 3,
  },
  {
    id: 3,
    name: 'K8s Prod Cluster',
    host: 'k8s-prod.example.com',
    type: 'kubernetes',
    environment: 'production',
    status: 'unhealthy',
    lastHeartbeat: '2025-11-09T09:15:00Z',
    databases: 8,
  },
]

export default function Servers() {
  const [servers, setServers] = useState<Server[]>(mockServers)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const { toast } = useToast()

  // Stats calculation
  const stats = {
    total: servers.length,
    healthy: servers.filter((s) => s.status === 'healthy').length,
    unhealthy: servers.filter((s) => s.status === 'unhealthy').length,
    production: servers.filter((s) => s.environment === 'production').length,
  }

  const getStatusBadge = (status: Server['status']) => {
    const variants = {
      healthy: 'success' as const,
      unhealthy: 'destructive' as const,
      unknown: 'secondary' as const,
    }
    return <Badge variant={variants[status]}>{status}</Badge>
  }

  const getEnvironmentBadge = (environment: Server['environment']) => {
    const variants = {
      production: 'destructive' as const,
      staging: 'warning' as const,
      development: 'info' as const,
    }
    return <Badge variant={variants[environment]}>{environment}</Badge>
  }

  const getTypeBadge = (type: Server['type']) => {
    const labels = {
      ssh: 'SSH',
      docker: 'Docker',
      kubernetes: 'K8s',
    }
    return <Badge variant="outline">{labels[type]}</Badge>
  }

  const handleTestConnection = (serverId: number) => {
    toast({
      title: 'Testing connection',
      description: `Testing connection to server ${serverId}...`,
      variant: 'info',
    })
    // Simulate connection test
    setTimeout(() => {
      toast({
        title: 'Connection successful',
        description: 'Server is reachable and responding',
        variant: 'success',
      })
    }, 2000)
  }

  const handleDeleteServer = (serverId: number) => {
    setServers(servers.filter((s) => s.id !== serverId))
    toast({
      title: 'Server deleted',
      description: 'Server has been removed successfully',
      variant: 'success',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Servers</h1>
          <p className="text-muted-foreground mt-1">
            Manage database servers across all environments
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Server
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Add New Server</DialogTitle>
              <DialogDescription>
                Register a new database server for backup management
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Server Name</Label>
                <Input id="name" placeholder="Production DB Server" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="host">Host/IP Address</Label>
                <Input id="host" placeholder="db-server.example.com" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type">Server Type</Label>
                <Select>
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ssh">SSH (Bare Metal)</SelectItem>
                    <SelectItem value="docker">Docker</SelectItem>
                    <SelectItem value="kubernetes">Kubernetes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="environment">Environment</Label>
                <Select>
                  <SelectTrigger id="environment">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="development">Development</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="port">Port</Label>
                <Input id="port" type="number" placeholder="22" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" placeholder="dbadmin" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setIsAddDialogOpen(false)
                  toast({
                    title: 'Server added',
                    description: 'Server has been registered successfully',
                    variant: 'success',
                  })
                }}
              >
                Add Server
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Servers</CardTitle>
            <ServerIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Across all environments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Healthy</CardTitle>
            <Activity className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.healthy}</div>
            <p className="text-xs text-muted-foreground">Responding normally</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unhealthy</CardTitle>
            <Activity className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.unhealthy}</div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Production</CardTitle>
            <ServerIcon className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.production}</div>
            <p className="text-xs text-muted-foreground">Critical systems</p>
          </CardContent>
        </Card>
      </div>

      {/* Servers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Registered Servers</CardTitle>
          <CardDescription>
            All database servers configured for backup operations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Server Name</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Databases</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((server) => (
                <TableRow key={server.id}>
                  <TableCell className="font-medium">{server.name}</TableCell>
                  <TableCell className="font-mono text-sm">{server.host}</TableCell>
                  <TableCell>{getTypeBadge(server.type)}</TableCell>
                  <TableCell>{getEnvironmentBadge(server.environment)}</TableCell>
                  <TableCell>{getStatusBadge(server.status)}</TableCell>
                  <TableCell>{server.databases}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleTestConnection(server.id)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteServer(server.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
