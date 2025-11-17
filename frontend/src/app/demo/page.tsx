import React from 'react'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import InteractiveDemo from '@/components/InteractiveDemo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Chrome } from 'lucide-react'

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            Interactive Experience
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            See MeetNote Extension
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              in Action
            </span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Experience how MeetNote transforms your meeting workflow in real-time. 
            Watch our interactive demo to see AI-powered meeting enhancement in action.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="gap-2 px-8 py-6 text-lg">
              <Chrome className="w-5 h-5" />
              Try it for Free
            </Button>
            <p className="text-sm text-muted-foreground">
              No installation required for the demo
            </p>
          </div>
        </div>
      </section>

      {/* Interactive Demo */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <InteractiveDemo />
      </section>

      {/* Key Benefits */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Why thousands choose MeetNote
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Experience the benefits that make MeetNote essential for productive meetings
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-blue-600">15min</span>
            </div>
            <h3 className="font-semibold text-lg mb-2">Time Saved per Meeting</h3>
            <p className="text-muted-foreground text-sm">
              Eliminate manual note-taking and post-meeting summary work with AI automation
            </p>
          </div>

          <div className="text-center p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-green-600">95%</span>
            </div>
            <h3 className="font-semibold text-lg mb-2">Accuracy Rate</h3>
            <p className="text-muted-foreground text-sm">
              Industry-leading transcription accuracy ensures you never miss important details
            </p>
          </div>

          <div className="text-center p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-purple-600">2sec</span>
            </div>
            <h3 className="font-semibold text-lg mb-2">Setup Time</h3>
            <p className="text-muted-foreground text-sm">
              Start recording and transcribing meetings instantly with one-click activation
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}