"use client"

import React from 'react'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, Chrome, CheckCircle, ExternalLink, Zap } from 'lucide-react'

export default function ExtensionPage() {
  const handleDownloadExtension = () => {
    // Create a download link for the extension
    const link = document.createElement('a')
    link.href = '/chrome-extension.zip'
    link.download = 'meetnote-extension.zip'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const installSteps = [
    {
      step: 1,
      title: 'Download Extension',
      description: 'Click the download button to get the MeetNote extension package',
      action: 'Download Now'
    },
    {
      step: 2,
      title: 'Extract Files', 
      description: 'Unzip the downloaded file to a folder on your computer',
      action: 'Unzip Package'
    },
    {
      step: 3,
      title: 'Open Chrome Extensions',
      description: 'Go to chrome://extensions/ in your Chrome browser',
      action: 'Open Extensions'
    },
    {
      step: 4,
      title: 'Enable Developer Mode',
      description: 'Toggle on "Developer mode" in the top right corner',
      action: 'Enable Mode'
    },
    {
      step: 5,
      title: 'Load Extension',
      description: 'Click "Load unpacked" and select the extracted folder',
      action: 'Load Unpacked'
    },
    {
      step: 6,
      title: 'Start Using',
      description: 'Join any meeting and start recording with AI insights!',
      action: 'Start Recording'
    }
  ]

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">
            <Chrome className="w-4 h-4 mr-1" />
            Chrome Extension
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Install MeetNote
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Extension
            </span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Get AI-powered meeting insights directly in your browser. 
            Connected to live backend with Assembly AI transcription and OpenRouter AI analysis.
          </p>

          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="flex items-center gap-1 px-3 py-1 bg-green-50 dark:bg-green-950 rounded-full">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-800 dark:text-green-200">Live Backend</span>
            </div>
            <div className="flex items-center gap-1 px-3 py-1 bg-blue-50 dark:bg-blue-950 rounded-full">
              <Zap className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-blue-800 dark:text-blue-200">AI Powered</span>
            </div>
          </div>

          <Button 
            size="lg" 
            onClick={handleDownloadExtension}
            className="gap-2 px-8 py-6 text-lg mb-4"
          >
            <Download className="w-5 h-5" />
            Download Extension
          </Button>
          
          <p className="text-sm text-muted-foreground">
            Free • Works with Zoom, Google Meet, Teams • 2MB download
          </p>
        </div>

        {/* Installation Steps */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-center mb-8">Installation Steps</h2>
          
          <div className="grid gap-6">
            {installSteps.map((step, index) => (
              <div key={step.step} className="flex gap-4 p-6 border rounded-lg bg-card">
                <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                  {step.step}
                </div>
                <div className="flex-grow">
                  <h3 className="font-semibold mb-1">{step.title}</h3>
                  <p className="text-muted-foreground text-sm mb-3">{step.description}</p>
                  {step.step === 3 && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open('chrome://extensions/', '_blank')}
                      className="gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {step.action}
                    </Button>
                  )}
                  {step.step === 1 && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleDownloadExtension}
                      className="gap-1"
                    >
                      <Download className="w-3 h-3" />
                      {step.action}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Features Preview */}
        <div className="mt-16 p-8 border rounded-2xl bg-gradient-to-br from-background to-muted/30">
          <h3 className="text-xl font-bold mb-4 text-center">What You Get</h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span>Real-time transcription overlay</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span>AI-powered meeting insights</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span>One-click recording for all platforms</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span>Connected to live backend</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span>Keyboard shortcuts (Alt+R, Alt+H, Alt+T)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span>Whisper AI transcription (free!)</span>
            </div>
          </div>
        </div>

        {/* Backend Connection Info */}
        <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            🔗 Connected to Live Backend
          </h4>
          <p className="text-blue-800 dark:text-blue-200 text-sm mb-2">
            This extension connects to our deployed backend at: 
            <code className="mx-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 rounded text-xs">
              https://meetnote-backend.onrender.com
            </code>
          </p>
          <p className="text-blue-700 dark:text-blue-300 text-xs">
            ✅ Whisper AI transcription • ✅ OpenRouter Mistral 7B • ✅ Real-time processing
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}