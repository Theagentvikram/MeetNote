"use client"

import React from 'react'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Settings, Chrome, Zap, CheckCircle, Shield, Bell, Keyboard, Palette } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">
            <Settings className="w-4 h-4 mr-1" />
            Extension Settings
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            MeetNote
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Settings
            </span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Customize your MeetNote extension experience. Configure recording preferences, 
            shortcuts, and visual settings.
          </p>
        </div>

        <div className="grid gap-8">
          {/* Recording Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Chrome className="w-5 h-5 text-blue-600" />
                Recording Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Auto-start recording</h4>
                  <p className="text-sm text-muted-foreground">
                    Automatically begin recording when joining a meeting
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Show live transcript</h4>
                  <p className="text-sm text-muted-foreground">
                    Display real-time transcription overlay during meetings
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Smart highlights</h4>
                  <p className="text-sm text-muted-foreground">
                    AI automatically creates highlights for key moments
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Background processing</h4>
                  <p className="text-sm text-muted-foreground">
                    Process recordings and generate insights in the background
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>

          {/* Notifications & Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-yellow-600" />
                Notifications & Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Recording notifications</h4>
                  <p className="text-sm text-muted-foreground">
                    Show notifications when recording starts/stops
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">AI insights alerts</h4>
                  <p className="text-sm text-muted-foreground">
                    Get notified when AI analysis is complete
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Weekly summaries</h4>
                  <p className="text-sm text-muted-foreground">
                    Receive weekly meeting activity summaries
                  </p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>

          {/* Keyboard Shortcuts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-green-600" />
                Keyboard Shortcuts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="font-medium">Toggle Recording</span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-2 py-1 bg-background border rounded text-sm">Alt</kbd>
                    <span>+</span>
                    <kbd className="px-2 py-1 bg-background border rounded text-sm">R</kbd>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="font-medium">Create Highlight</span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-2 py-1 bg-background border rounded text-sm">Alt</kbd>
                    <span>+</span>
                    <kbd className="px-2 py-1 bg-background border rounded text-sm">H</kbd>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="font-medium">Toggle Transcript</span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-2 py-1 bg-background border rounded text-sm">Alt</kbd>
                    <span>+</span>
                    <kbd className="px-2 py-1 bg-background border rounded text-sm">T</kbd>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Privacy & Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-600" />
                Privacy & Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Local processing</h4>
                  <p className="text-sm text-muted-foreground">
                    Process audio locally when possible for enhanced privacy
                  </p>
                </div>
                <Switch />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Anonymous analytics</h4>
                  <p className="text-sm text-muted-foreground">
                    Help improve MeetNote by sharing anonymous usage data
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Auto-delete recordings</h4>
                  <p className="text-sm text-muted-foreground">
                    Automatically delete recordings after 30 days
                  </p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>

          {/* Interface Customization */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-pink-600" />
                Interface & Appearance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Compact controls</h4>
                  <p className="text-sm text-muted-foreground">
                    Use smaller, more subtle extension controls
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Dark theme</h4>
                  <p className="text-sm text-muted-foreground">
                    Use dark theme for transcript overlay and controls
                  </p>
                </div>
                <Switch />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Minimal branding</h4>
                  <p className="text-sm text-muted-foreground">
                    Hide MeetNote branding from meeting participants
                  </p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>

          {/* Connection Status */}
          <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-600" />
                Connection Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="font-medium">Backend Connected</div>
                    <div className="text-sm text-muted-foreground">
                      https://meetnote.onrender.com
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="font-medium">Assembly AI Ready</div>
                    <div className="text-sm text-muted-foreground">
                      Transcription service operational
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="font-medium">OpenRouter AI Active</div>
                    <div className="text-sm text-muted-foreground">
                      AI analysis and insights available
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Settings */}
          <div className="flex justify-center gap-4">
            <Button variant="outline" size="lg">
              Reset to Defaults
            </Button>
            <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600">
              Save Settings
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}