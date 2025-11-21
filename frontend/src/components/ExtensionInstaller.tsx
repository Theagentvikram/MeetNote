"use client"

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Chrome, Download, CheckCircle, AlertCircle } from 'lucide-react'

export default function ExtensionInstaller() {
  const [installationStatus, setInstallationStatus] = useState<'idle' | 'installing' | 'installed' | 'error'>('idle')
  const [isSupported, setIsSupported] = useState(false)

  useEffect(() => {
    // Check if we're in Chrome and if installation is supported
    const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor)
    setIsSupported(isChrome)
  }, [])

  const handleInstallExtension = () => {
    if (!isSupported) {
      alert('Please use Google Chrome to install this extension.')
      return
    }

    setInstallationStatus('installing')
    
    // Redirect to dedicated installation page
    window.open('/extension', '_blank')
    setInstallationStatus('installed')
  }

  const getStatusIcon = () => {
    switch (installationStatus) {
      case 'installing':
        return <Download className="w-4 h-4 animate-pulse" />
      case 'installed':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />
      default:
        return <Chrome className="w-4 h-4" />
    }
  }

  const getStatusText = () => {
    switch (installationStatus) {
      case 'installing':
        return 'Installing...'
      case 'installed':
        return 'Installed!'
      case 'error':
        return 'Installation Failed'
      default:
        return 'Add to Chrome'
    }
  }

  if (!isSupported) {
    return (
      <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-yellow-600" />
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            Chrome extension requires Google Chrome browser
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center gap-4">
        <Button
          onClick={handleInstallExtension}
          disabled={installationStatus === 'installing'}
          size="lg"
          className="gap-2 px-6 py-3"
        >
          {getStatusIcon()}
          {getStatusText()}
        </Button>
        
        {installationStatus === 'installed' && (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle className="w-3 h-3" />
            Connected to live backend
          </Badge>
        )}
      </div>


    </div>
  )
}