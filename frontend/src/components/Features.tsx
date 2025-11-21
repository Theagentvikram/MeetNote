"use client"

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Mic, 
  FileText, 
  Zap, 
  Share, 
  Calendar, 
  MousePointer,
  Sparkles,
  Clock
} from 'lucide-react'

const features = [
  {
    icon: <MousePointer className="w-6 h-6" />,
    title: "One-Click Recording",
    description: "Start recording any meeting with a single click. Automatically detects Zoom, Google Meet, and Teams links.",
    priority: "High",
    color: "bg-blue-50 dark:bg-blue-950"
  },
  {
    icon: <FileText className="w-6 h-6" />,
    title: "Real-Time Transcription",
    description: "Live transcripts appear as an overlay during meetings. Never miss important details again.",
    priority: "High", 
    color: "bg-purple-50 dark:bg-purple-950"
  },
  {
    icon: <Sparkles className="w-6 h-6" />,
    title: "AI-Powered Highlights",
    description: "Automatically identify key moments and create shareable clips with AI-generated summaries.",
    priority: "High",
    color: "bg-green-50 dark:bg-green-950"
  },
  {
    icon: <Share className="w-6 h-6" />,
    title: "Instant Sharing",
    description: "Share clips directly to Slack, HubSpot, email, or other integrated platforms without leaving your browser.",
    priority: "High",
    color: "bg-orange-50 dark:bg-orange-950"
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: "Smart Context Detection",
    description: "Automatically recognizes meeting-related content and suggests relevant MeetNote actions.",
    priority: "Medium",
    color: "bg-pink-50 dark:bg-pink-950"
  },
  {
    icon: <Calendar className="w-6 h-6" />,
    title: "Calendar Integration",
    description: "See recording status and meeting insights directly on your web calendar.",
    priority: "Medium",
    color: "bg-indigo-50 dark:bg-indigo-950"
  }
]

export default function Features() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="text-center mb-16">
        <Badge variant="secondary" className="mb-4">
          Core Features
        </Badge>
        <h2 className="text-3xl md:text-5xl font-bold mb-6">
          Everything you need for
          <br />
          <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            smarter meetings
          </span>
        </h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Powerful AI-driven features that work seamlessly in your browser. 
          No downloads, no separate apps, just intelligent meeting enhancement.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, index) => (
          <Card 
            key={index} 
            className="group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-background to-muted/30"
          >
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl ${feature.color} group-hover:scale-110 transition-transform duration-300`}>
                  {feature.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-lg">{feature.title}</h3>
                    <Badge 
                      variant={feature.priority === 'High' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {feature.priority}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stats Section */}
      <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        <div className="space-y-2">
          <div className="flex items-center justify-center">
            <Clock className="w-5 h-5 text-blue-600 mr-2" />
            <span className="text-3xl font-bold">15min</span>
          </div>
          <p className="text-sm text-muted-foreground">Time saved per meeting</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-purple-600 mr-2" />
            <span className="text-3xl font-bold">40%</span>
          </div>
          <p className="text-sm text-muted-foreground">Increase in meeting capture</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-center">
            <Share className="w-5 h-5 text-green-600 mr-2" />
            <span className="text-3xl font-bold">300%</span>
          </div>
          <p className="text-sm text-muted-foreground">More clips shared</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-center">
            <Zap className="w-5 h-5 text-orange-600 mr-2" />
            <span className="text-3xl font-bold">2sec</span>
          </div>
          <p className="text-sm text-muted-foreground">Extension load time</p>
        </div>
      </div>
    </section>
  )
}