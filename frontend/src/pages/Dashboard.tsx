import {
  Database,
  Server,
  Calendar,
  Activity,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'

// Mock data for charts
const backupTrendData = [
  { date: '11/03', successful: 45, failed: 2 },
  { date: '11/04', successful: 52, failed: 1 },
  { date: '11/05', successful: 48, failed: 3 },
  { date: '11/06', successful: 61, failed: 0 },
  { date: '11/07', successful: 55, failed: 2 },
  { date: '11/08', successful: 58, failed: 1 },
  { date: '11/09', successful: 62, failed: 1 },
]

const storageUsageData = [
  { name: 'PostgreSQL', size: 245 },
  { name: 'MySQL', size: 180 },
  { name: 'MongoDB', size: 320 },
  { name: 'Redis', size: 45 },
]

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your database backup infrastructure
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Servers</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600">+2</span> from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Backups</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">248</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600">+23</span> this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Schedules</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">18</div>
            <p className="text-xs text-muted-foreground">
              All running normally
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">98.7%</div>
            <p className="text-xs text-muted-foreground">
              Last 30 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Backup Trend</CardTitle>
            <CardDescription>
              Daily backup operations over the last 7 days
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={backupTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="successful"
                  stackId="1"
                  stroke="#22c55e"
                  fill="#22c55e"
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="failed"
                  stackId="1"
                  stroke="#ef4444"
                  fill="#ef4444"
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Storage by Database Type</CardTitle>
            <CardDescription>Total: 790 GB</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={storageUsageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="size" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Tabs defaultValue="backups" className="space-y-4">
        <TabsList>
          <TabsTrigger value="backups">Recent Backups</TabsTrigger>
          <TabsTrigger value="servers">Server Health</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="backups" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Backup Operations</CardTitle>
              <CardDescription>
                Latest backup jobs across all servers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  {
                    name: 'Production PostgreSQL',
                    db: 'PostgreSQL',
                    size: '2.3 GB',
                    time: '2 min ago',
                    status: 'success',
                  },
                  {
                    name: 'Staging MySQL',
                    db: 'MySQL',
                    size: '1.8 GB',
                    time: '15 min ago',
                    status: 'success',
                  },
                  {
                    name: 'Analytics MongoDB',
                    db: 'MongoDB',
                    size: '5.2 GB',
                    time: '1 hour ago',
                    status: 'success',
                  },
                  {
                    name: 'Cache Redis',
                    db: 'Redis',
                    size: '124 MB',
                    time: '2 hours ago',
                    status: 'success',
                  },
                  {
                    name: 'Dev PostgreSQL',
                    db: 'PostgreSQL',
                    size: '892 MB',
                    time: '3 hours ago',
                    status: 'failed',
                  },
                ].map((backup, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded">
                        <Database className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium">{backup.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {backup.db} • {backup.size}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {backup.time}
                      </span>
                      {backup.status === 'success' ? (
                        <Badge variant="success">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Success
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <AlertCircle className="mr-1 h-3 w-3" />
                          Failed
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="servers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Server Health Status</CardTitle>
              <CardDescription>
                Real-time health monitoring of all registered servers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  {
                    name: 'Production DB Server',
                    host: 'prod-db-01.example.com',
                    status: 'healthy',
                    uptime: '99.9%',
                  },
                  {
                    name: 'Staging PostgreSQL',
                    host: 'staging-postgres.example.com',
                    status: 'healthy',
                    uptime: '99.7%',
                  },
                  {
                    name: 'K8s Prod Cluster',
                    host: 'k8s-prod.example.com',
                    status: 'degraded',
                    uptime: '98.2%',
                  },
                  {
                    name: 'Analytics MongoDB',
                    host: 'analytics-mongo.example.com',
                    status: 'healthy',
                    uptime: '100%',
                  },
                  {
                    name: 'Cache Redis',
                    host: 'cache-redis.example.com',
                    status: 'healthy',
                    uptime: '99.8%',
                  },
                ].map((server, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded">
                        <Server className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium">{server.name}</p>
                        <p className="text-sm text-muted-foreground font-mono">
                          {server.host}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Uptime</p>
                        <p className="font-semibold">{server.uptime}</p>
                      </div>
                      {server.status === 'healthy' ? (
                        <Badge variant="success">
                          <Activity className="mr-1 h-3 w-3" />
                          Healthy
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          <AlertCircle className="mr-1 h-3 w-3" />
                          Degraded
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Alerts</CardTitle>
              <CardDescription>
                Recent warnings and notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  {
                    title: 'Backup failed on Dev PostgreSQL',
                    message: 'Connection timeout after 300 seconds',
                    time: '3 hours ago',
                    severity: 'error',
                  },
                  {
                    title: 'High storage usage detected',
                    message:
                      'MongoDB backups using 85% of allocated storage',
                    time: '5 hours ago',
                    severity: 'warning',
                  },
                  {
                    title: 'Scheduled maintenance upcoming',
                    message:
                      'Production DB Server will be updated on Nov 12',
                    time: '1 day ago',
                    severity: 'info',
                  },
                ].map((alert, i) => (
                  <div
                    key={i}
                    className="flex gap-3 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div
                      className={`p-2 rounded h-fit ${
                        alert.severity === 'error'
                          ? 'bg-red-100'
                          : alert.severity === 'warning'
                          ? 'bg-yellow-100'
                          : 'bg-blue-100'
                      }`}
                    >
                      {alert.severity === 'error' ? (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      ) : alert.severity === 'warning' ? (
                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                      ) : (
                        <Clock className="h-4 w-4 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{alert.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {alert.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {alert.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
