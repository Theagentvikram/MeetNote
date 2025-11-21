"use client"

import React from 'react'

interface ErrorReporterProps {
  error?: Error & { digest?: string }
  reset?: () => void
}

export default function ErrorReporter({ error, reset }: ErrorReporterProps) {
  if (!error) {
    return null
  }

  return (
    <html>
      <body className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-destructive">
              Something went wrong!
            </h1>
            <p className="text-muted-foreground">
              We encountered an unexpected error. Please try again.
            </p>
          </div>
          
          {reset && (
            <button 
              onClick={reset}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Try again
            </button>
          )}
          
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              Error details
            </summary>
            <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto">
              {error.message}
              {error.digest && (
                <div className="mt-2 text-muted-foreground">
                  Error ID: {error.digest}
                </div>
              )}
            </pre>
          </details>
        </div>
      </body>
    </html>
  )
}
