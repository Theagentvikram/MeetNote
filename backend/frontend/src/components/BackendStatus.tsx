"use client"

import React, { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import api from '@/lib/api'

export default function BackendStatus() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')

  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        const isHealthy = await api.checkHealth()
        setStatus(isHealthy ? 'connected' : 'disconnected')
      } catch (error) {
        setStatus('disconnected')
      }
    }

    // Check immediately
    checkBackendHealth()

    // Check every 30 seconds
    const interval = setInterval(checkBackendHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  const getStatusConfig = () => {
    switch (status) {
      case 'checking':
        return {
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          text: 'Checking backend...',
          variant: 'secondary' as const,
        }
      case 'connected':
        return {
          icon: <CheckCircle className="w-3 h-3" />,
          text: 'Backend connected',
          variant: 'default' as const,
        }
      case 'disconnected':
        return {
          icon: <XCircle className="w-3 h-3" />,
          text: 'Backend offline',
          variant: 'destructive' as const,
        }
    }
  }

  const config = getStatusConfig()

  return (
    <Badge variant={config.variant} className="gap-1 text-xs">
      {config.icon}
      {config.text}
    </Badge>
  )
}