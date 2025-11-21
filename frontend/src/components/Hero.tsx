"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Chrome, Play, Star } from 'lucide-react'
import Image from 'next/image'
import ExtensionInstaller from '@/components/ExtensionInstaller'
import BackendStatus from '@/components/BackendStatus'

export default function Hero() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="text-center">
        {/* Badge with Backend Status */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <Badge variant="secondary" className="px-4 py-2">
            🚀 Now available for Chrome
          </Badge>
          <BackendStatus />
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
          MeetNote - AI Meeting
          <br />
          <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            Assistant
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
          Record, transcribe, and extract AI-powered insights from any meeting directly in your browser. 
          No separate software required.
        </p>

        {/* Extension Installer */}
        <div className="mb-12">
          <ExtensionInstaller />
        </div>

        {/* Social Proof */}
        <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground mb-16">
          <div className="flex items-center gap-1">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star key={star} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              ))}
            </div>
            <span className="ml-2">4.9/5 rating</span>
          </div>
          <div className="h-4 w-px bg-border"></div>
          <span>10,000+ users</span>
          <div className="h-4 w-px bg-border"></div>
          <span>Trusted by sales teams</span>
        </div>

        {/* Hero Image/Mockup */}
        <div className="relative max-w-5xl mx-auto">
          <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-8 border">
            <Image
              src="https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=2850&q=80"
              alt="MeetNote Chrome Extension Interface"
              width={1200}
              height={800}
              className="rounded-lg shadow-lg"
            />
            
            {/* Extension UI Overlay */}
            <div className="absolute top-12 right-12 bg-white dark:bg-gray-900 rounded-lg shadow-xl p-4 border max-w-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-6 h-6 bg-gradient-to-r from-blue-600 to-purple-600 rounded flex items-center justify-center">
                  <span className="text-white font-bold text-xs">M</span>
                </div>
                <span className="font-semibold">MeetNote Extension</span>
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              </div>
              <div className="text-sm space-y-2">
                <div className="bg-gray-100 dark:bg-gray-800 rounded p-2">
                  <p className="text-xs text-muted-foreground">Live transcript:</p>
                  <p className="text-sm">"Let's discuss the Q4 roadmap..."</p>
                </div>
                <Button size="sm" className="w-full">
                  Create Highlight
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}