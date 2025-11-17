"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Play, Download, Share2, Calendar, Clock, Users, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'

// Mock meeting data - FOR DEMO ONLY (will be replaced with real API data)
const mockMeetings = [
  {
    id: 1,
    title: 'Team Standup - Sprint 15',
    platform: 'Google Meet',
    duration: '00:23:45',
    date: '2025-09-27',
    participants: 5,
    status: 'completed',
    highlights: 3,
    summary: 'Discussed sprint progress, blockers, and upcoming deadlines.',
  },
  {
    id: 2,
    title: 'Product Strategy Review',
    platform: 'Zoom',
    duration: '01:15:22',
    date: '2025-09-26',
    participants: 8,
    status: 'processing',
    highlights: 7,
    summary: 'Comprehensive review of Q4 product roadmap and feature prioritization.',
  },
  {
    id: 3,
    title: 'Client Presentation - Q4 Updates',
    platform: 'Microsoft Teams',
    duration: '00:45:18',
    date: '2025-09-25',
    participants: 12,
    status: 'completed',
    highlights: 5,
    summary: 'Presented quarterly achievements and upcoming feature releases.',
  },
]

function getStatusColor(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'processing':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 'recording':
      return 'bg-red-100 text-red-800 border-red-200'
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

function getPlatformColor(platform: string) {
  switch (platform) {
    case 'Google Meet':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'Zoom':
      return 'bg-purple-100 text-purple-800 border-purple-200'
    case 'Microsoft Teams':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200'
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    loadMeetings()
  }, [])

  async function loadMeetings() {
    try {
      setLoading(true)
      setError(null)
      
      // Check for token from URL (passed by extension) or localStorage
      const urlParams = new URLSearchParams(window.location.search)
      const urlToken = urlParams.get('token')
      let token = urlToken || localStorage.getItem('token')
      
      // If token came from URL, store it locally
      if (urlToken) {
        localStorage.setItem('token', urlToken)
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname)
      }
      
      if (!token) {
        setIsAuthenticated(false)
        setMeetings(mockMeetings) // Show mock data if not authenticated
        setLoading(false)
        return
      }
      
      setIsAuthenticated(true)
      
      // Fetch real meetings from backend
      const response = await api.getMeetings(token)
      
      if (response.meetings && response.meetings.length > 0) {
        setMeetings(response.meetings)
      } else {
        // No meetings yet, show mock data for demo
        setMeetings(mockMeetings)
      }
    } catch (err: any) {
      console.error('Failed to load meetings:', err)
      setError(err.message || 'Failed to load meetings')
      // Show mock data on error
      setMeetings(mockMeetings)
    } finally {
      setLoading(false)
    }
  }

  async function handleQuickLogin() {
    const email = (document.getElementById('email-input') as HTMLInputElement)?.value
    const password = (document.getElementById('password-input') as HTMLInputElement)?.value
    
    if (!email || !password) {
      alert('Please enter email and password')
      return
    }
    
    try {
      const response = await api.login(email, password)
      if (response.token) {
        localStorage.setItem('token', response.token)
        loadMeetings() // Reload with authentication
      }
    } catch (error) {
      alert('Login failed: ' + (error as Error).message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your meetings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
      <div className="container mx-auto px-4 py-12">
        {/* Auth Warning */}
        {!isAuthenticated && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800 text-center mb-4">
              <strong>Demo Mode:</strong> Log in to see your real meetings.
            </p>
            <div className="flex justify-center">
              <div className="flex gap-2 max-w-md w-full">
                <input
                  type="email"
                  placeholder="Email"
                  className="flex-1 px-3 py-2 border border-yellow-300 rounded text-sm"
                  id="email-input"
                />
                <input
                  type="password"
                  placeholder="Password"
                  className="flex-1 px-3 py-2 border border-yellow-300 rounded text-sm"
                  id="password-input"
                />
                <Button onClick={handleQuickLogin} size="sm" className="bg-yellow-600 hover:bg-yellow-700">
                  Login
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-center">
              {error} - Showing demo data instead.
            </p>
          </div>
        )}
        
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-4">
            Your Meetings
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            View, manage, and access insights from your recorded meetings
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Meetings</p>
                  <p className="text-2xl font-bold text-gray-900">24</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Hours Recorded</p>
                  <p className="text-2xl font-bold text-gray-900">18.5</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Users className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Participants</p>
                  <p className="text-2xl font-bold text-gray-900">142</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Play className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Highlights</p>
                  <p className="text-2xl font-bold text-gray-900">57</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Meetings List */}
        <div className="space-y-6">
          {meetings.map((meeting) => (
            <Card key={meeting.id} className="border-0 shadow-lg bg-white/80 backdrop-blur-sm hover:shadow-xl transition-all duration-300">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl text-gray-900 mb-2">
                      {meeting.title}
                    </CardTitle>
                    <CardDescription className="text-gray-600 text-base">
                      {meeting.summary}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end space-y-2">
                    <Badge className={`${getStatusColor(meeting.status)} border`}>
                      {meeting.status}
                    </Badge>
                    <Badge className={`${getPlatformColor(meeting.platform)} border`}>
                      {meeting.platform}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  {/* Meeting Details */}
                  <div className="flex items-center space-x-6 text-sm text-gray-600">
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-4 w-4" />
                      <span>{new Date(meeting.date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Clock className="h-4 w-4" />
                      <span>{meeting.duration}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Users className="h-4 w-4" />
                      <span>{meeting.participants} participants</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Play className="h-4 w-4" />
                      <span>{meeting.highlights} highlights</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm" className="hover:bg-purple-50">
                      <Play className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <Button variant="outline" size="sm" className="hover:bg-blue-50">
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                    <Button variant="outline" size="sm" className="hover:bg-green-50">
                      <Share2 className="h-4 w-4 mr-1" />
                      Share
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State (when no meetings) */}
        {meetings.length === 0 && (
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm text-center py-12">
            <CardContent>
              <div className="max-w-md mx-auto">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No meetings yet
                </h3>
                <p className="text-gray-600 mb-6">
                  Install the MeetNote Chrome extension and start recording your meetings to see them here.
                </p>
                <Button className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
                  Get Chrome Extension
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}