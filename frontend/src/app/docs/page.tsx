import React from 'react'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Chrome,
  Download,
  Settings,
  User,
  Shield,
  HelpCircle,
  CheckCircle,
  ArrowRight,
  Copy,
  ExternalLink,
  AlertTriangle,
  Lightbulb
} from 'lucide-react'
import Image from 'next/image'

const installSteps = [
  {
    step: 1,
    title: "Visit Chrome Web Store",
    description: "Click the button below to go to the MeetNote Extension page in the Chrome Web Store",
    action: "Open Chrome Web Store",
    icon: <Chrome className="w-6 h-6" />
  },
  {
    step: 2,
    title: "Add to Chrome", 
    description: "Click the 'Add to Chrome' button and confirm the installation when prompted",
    action: "Install Extension",
    icon: <Download className="w-6 h-6" />
  },
  {
    step: 3,
    title: "Grant Permissions",
    description: "Allow the extension to access tabs and meeting platforms for full functionality",
    action: "Accept Permissions", 
    icon: <Shield className="w-6 h-6" />
  },
  {
    step: 4,
    title: "Connect Your Account",
    description: "Sign in with your MeetNote account or create a new one to sync your meetings",
    action: "Sign In",
    icon: <User className="w-6 h-6" />
  }
]

const permissions = [
  {
    name: "activeTab",
    description: "Access current tab content to detect meeting links and provide contextual features",
    required: true
  },
  {
    name: "storage", 
    description: "Store user preferences and temporary meeting data locally",
    required: true
  },
  {
    name: "notifications",
    description: "Show recording status updates and completion alerts",
    required: true
  },
  {
    name: "tabs",
    description: "Manage meeting-related tabs and inject recording controls",
    required: true
  },
  {
    name: "webRequest",
    description: "Intercept meeting platform requests for seamless integration",
    required: false
  }
]

const troubleshooting = [
  {
    issue: "Extension not detecting meetings",
    solution: "Ensure you're on a supported meeting platform (Zoom, Google Meet, Teams) and the extension has proper permissions.",
    type: "common"
  },
  {
    issue: "Recording not starting",
    solution: "Check that microphone permissions are enabled in Chrome settings and refresh the meeting page.",
    type: "common"
  },
  {
    issue: "Transcripts not appearing",
    solution: "Verify internet connection and ensure the extension is updated to the latest version.",
    type: "common"
  },
  {
    issue: "Unable to share clips",
    solution: "Connect your integrations in settings and ensure third-party cookies are enabled.",
    type: "integration"
  }
]

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            Getting Started Guide
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Installation &
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Setup Guide
            </span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Get up and running with MeetNote Extension in minutes. Follow our step-by-step guide 
            for seamless installation and configuration.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <Tabs defaultValue="installation" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="installation">Installation</TabsTrigger>
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="troubleshooting">Help</TabsTrigger>
          </TabsList>

          {/* Installation Tab */}
          <TabsContent value="installation" className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  Quick Installation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <Button size="lg" className="gap-2 mb-4">
                    <Chrome className="w-5 h-5" />
                    Install from Chrome Web Store
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Free installation • No credit card required • 100% secure
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  {installSteps.map((step, index) => (
                    <div key={index} className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-xl flex items-center justify-center">
                        {step.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-muted-foreground">Step {step.step}</span>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold mb-2">{step.title}</h3>
                        <p className="text-sm text-muted-foreground mb-3">{step.description}</p>
                        <Button variant="outline" size="sm">
                          {step.action}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* System Requirements */}
            <Card>
              <CardHeader>
                <CardTitle>System Requirements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <h4 className="font-semibold mb-2">Browser Support</h4>
                    <ul className="space-y-1 text-sm">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Chrome 88+
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Edge 88+
                      </li>
                      <li className="flex items-center gap-2 text-muted-foreground">
                        <div className="w-4 h-4 rounded-full border-2 border-muted-foreground"></div>
                        Firefox (Coming Soon)
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Platform Support</h4>
                    <ul className="space-y-1 text-sm">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Zoom Web Client
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Google Meet
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Microsoft Teams
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        WebEx (Beta)
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Performance</h4>
                    <ul className="space-y-1 text-sm">
                      <li>Memory: 50MB max</li>
                      <li>CPU: Minimal impact</li>
                      <li>Network: Optimized</li>
                      <li>Battery: Efficient</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Setup Tab */}
          <TabsContent value="setup" className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Initial Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-3">Account Connection</h3>
                  <div className="bg-muted/30 rounded-lg p-4">
                                        <p className="text-sm mb-3">Connect your existing MeetNote account or create a new one:</p>
                    <div className="flex gap-3">
                                            <Button>Sign In with MeetNote</Button>
                      <Button variant="outline">Create New Account</Button>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Recording Preferences</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <h4 className="font-medium">Auto-start recording</h4>
                        <p className="text-sm text-muted-foreground">Automatically begin recording when joining meetings</p>
                      </div>
                      <Button variant="outline" size="sm">Enable</Button>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <h4 className="font-medium">Show live transcripts</h4>
                        <p className="text-sm text-muted-foreground">Display real-time transcription overlay</p>
                      </div>
                      <Button variant="outline" size="sm">Enable</Button>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <h4 className="font-medium">Smart highlights</h4>
                        <p className="text-sm text-muted-foreground">AI-powered automatic moment detection</p>
                      </div>
                      <Button variant="outline" size="sm">Enable</Button>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Integration Setup</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <Card className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                          <span className="text-sm font-bold">S</span>
                        </div>
                        <span className="font-medium">Slack</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">Share clips directly to Slack channels</p>
                      <Button size="sm" className="w-full">Connect Slack</Button>
                    </Card>
                    <Card className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center">
                          <span className="text-sm font-bold">H</span>
                        </div>
                        <span className="font-medium">HubSpot</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">Sync meeting insights with CRM records</p>
                      <Button size="sm" className="w-full">Connect HubSpot</Button>
                    </Card>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Permissions Tab */}
          <TabsContent value="permissions" className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Browser Permissions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                    <Lightbulb className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Privacy First Approach</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        MeetNote Extension only requests the minimum permissions needed for functionality. 
                        All data is processed securely and never shared without your consent.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {permissions.map((permission, index) => (
                    <div key={index} className="flex items-start gap-4 p-4 border rounded-lg">
                      <div className="flex-shrink-0">
                        {permission.required ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-muted-foreground"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{permission.name}</h3>
                          <Badge variant={permission.required ? "default" : "secondary"} className="text-xs">
                            {permission.required ? "Required" : "Optional"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{permission.description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                  <h3 className="font-semibold mb-2">Managing Permissions</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    You can review and modify extension permissions at any time in Chrome settings.
                  </p>
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    Open Chrome Extensions
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Troubleshooting Tab */}
          <TabsContent value="troubleshooting" className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="w-5 h-5" />
                  Troubleshooting Guide
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold mb-4">Common Issues</h3>
                    <div className="space-y-4">
                      {troubleshooting.filter(item => item.type === 'common').map((item, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <h4 className="font-medium mb-2">{item.issue}</h4>
                              <p className="text-sm text-muted-foreground">{item.solution}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-4">Integration Issues</h3>
                    <div className="space-y-4">
                      {troubleshooting.filter(item => item.type === 'integration').map((item, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <h4 className="font-medium mb-2">{item.issue}</h4>
                              <p className="text-sm text-muted-foreground">{item.solution}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-4">Need More Help?</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <Card className="p-4">
                        <h4 className="font-medium mb-2">Contact Support</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Get personalized help from our support team
                        </p>
                        <Button size="sm" className="w-full">
                          Open Support Chat
                        </Button>
                      </Card>
                      <Card className="p-4">
                        <h4 className="font-medium mb-2">Community Forum</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Connect with other users and share solutions
                        </p>
                        <Button variant="outline" size="sm" className="w-full">
                          Visit Forum
                        </Button>
                      </Card>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Footer />
    </div>
  )
}