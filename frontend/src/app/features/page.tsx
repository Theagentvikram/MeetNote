import React from 'react'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  MousePointer, 
  FileText, 
  Sparkles, 
  Share, 
  Zap, 
  Calendar,
  Chrome,
  Clock,
  Users,
  BarChart3,
  Shield,
  Workflow,
  MessageSquare,
  Target
} from 'lucide-react'
import Image from 'next/image'

const coreFeatures = [
  {
    icon: <MousePointer className="w-8 h-8" />,
    title: "One-Click Meeting Join & Record",
    description: "Automatically detect meeting links (Zoom, Google Meet, Teams) on web pages and provide one-click recording activation",
    benefits: [
      "Seamless meeting detection across platforms",
      "No manual setup or configuration required", 
      "Works with all major video conferencing tools"
    ],
    priority: "High"
  },
  {
    icon: <FileText className="w-8 h-8" />,
    title: "Real-Time Transcript Overlay",
    description: "Show live transcription as an overlay or sidebar during web-based meetings",
    benefits: [
      "Live transcripts with <500ms lag",
      "Non-intrusive overlay design",
      "Searchable transcript history"
    ],
    priority: "High"
  },
  {
    icon: <Sparkles className="w-8 h-8" />,
    title: "Instant Highlight Creation", 
    description: "Select text from any webpage or transcript to create video highlights and clips",
    benefits: [
      "AI-powered moment detection",
      "One-click clip creation",
      "Automatic summary generation"
    ],
    priority: "High"
  },
  {
    icon: <Share className="w-8 h-8" />,
    title: "Quick Share Integration",
    description: "Share clips and insights directly to Slack, HubSpot, email, or other integrated platforms",
    benefits: [
      "Direct platform integration",
      "Customizable sharing templates",
      "Team collaboration features"
    ],
    priority: "High"
  }
]

const advancedFeatures = [
  {
    icon: <Zap className="w-6 h-6" />,
    title: "Smart Context Detection",
    description: "Automatically recognize meeting-related content and suggest relevant actions"
  },
  {
    icon: <Calendar className="w-6 h-6" />,
    title: "Calendar Integration Badge", 
    description: "Display recording status and meeting information on calendar web pages"
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: "Meeting Insights Popup",
    description: "Show relevant meeting data, action items, and summaries in browser popup"
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: "Enterprise Security",
    description: "Bank-level encryption and compliance with SOC 2 Type II standards"
  },
  {
    icon: <Workflow className="w-6 h-6" />,
    title: "API Integration",
    description: "Connect with 50+ business tools including CRMs, project management, and communication platforms"
  },
  {
    icon: <MessageSquare className="w-6 h-6" />,
    title: "AI Meeting Summaries",
    description: "Automatically generate action items, decisions, and key takeaways"
  }
]

const integrations = [
  { name: "Zoom", logo: "https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=100&h=100&fit=crop" },
  { name: "Google Meet", logo: "https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?w=100&h=100&fit=crop" },
  { name: "Microsoft Teams", logo: "https://images.unsplash.com/photo-1618044619888-009e412ff12a?w=100&h=100&fit=crop" },
  { name: "Slack", logo: "https://images.unsplash.com/photo-1611606063065-ee7946f0787a?w=100&h=100&fit=crop" },
  { name: "HubSpot", logo: "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=100&h=100&fit=crop" },
  { name: "Salesforce", logo: "https://images.unsplash.com/photo-1560472355-536de3962603?w=100&h=100&fit=crop" }
]

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            Complete Feature Overview
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Powerful Features for
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Every Meeting
            </span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            From instant recording to AI-powered insights, discover how MeetNote 
            transforms your meeting workflow with cutting-edge browser-native features.
          </p>
        </div>

        {/* Performance Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-20">
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Clock className="w-5 h-5 text-blue-600 mr-2" />
              <span className="text-3xl font-bold">&lt;2sec</span>
            </div>
            <p className="text-sm text-muted-foreground">Extension load time</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Target className="w-5 h-5 text-green-600 mr-2" />
              <span className="text-3xl font-bold">&lt;500ms</span>
            </div>
            <p className="text-sm text-muted-foreground">Transcript display lag</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Users className="w-5 h-5 text-purple-600 mr-2" />
              <span className="text-3xl font-bold">50MB</span>
            </div>
            <p className="text-sm text-muted-foreground">Max memory usage</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Shield className="w-5 h-5 text-orange-600 mr-2" />
              <span className="text-3xl font-bold">100%</span>
            </div>
            <p className="text-sm text-muted-foreground">Privacy protected</p>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Core Features</h2>
          <p className="text-lg text-muted-foreground">
            Essential functionality that powers productive meetings
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {coreFeatures.map((feature, index) => (
            <Card key={index} className="group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-background to-muted/20">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 group-hover:scale-110 transition-transform">
                    {feature.icon}
                  </div>
                  <div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                    <Badge variant={feature.priority === 'High' ? 'default' : 'secondary'} className="mt-2">
                      {feature.priority} Priority
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-6">{feature.description}</p>
                <div className="space-y-2">
                  {feature.benefits.map((benefit, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                      <span className="text-sm">{benefit}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Advanced Features Grid */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto bg-muted/20 rounded-3xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Advanced Capabilities</h2>
          <p className="text-lg text-muted-foreground">
            Next-level features for power users and teams
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {advancedFeatures.map((feature, index) => (
            <Card key={index} className="group hover:shadow-lg transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 group-hover:scale-110 transition-transform">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Integrations */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Works with your favorite tools
          </h2>
          <p className="text-lg text-muted-foreground">
            Seamlessly integrate with the platforms you already use
          </p>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-8">
          {integrations.map((integration, index) => (
            <div key={index} className="text-center group">
              <div className="w-16 h-16 mx-auto mb-3 rounded-2xl overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 group-hover:scale-110 transition-transform">
                <Image
                  src={integration.logo}
                  alt={integration.name}
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-sm font-medium">{integration.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-3xl p-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to experience these features?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                        Install MeetNote now and start transforming your meetings with AI-powered insights and seamless browser integration.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="gap-2 px-8 py-6 text-lg">
              <Chrome className="w-5 h-5" />
              Add to Chrome - Free
            </Button>
            <Button variant="outline" size="lg" className="px-8 py-6 text-lg">
              View Demo
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}