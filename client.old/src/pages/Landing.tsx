import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FileText,
  Upload,
  Search,
  MessageSquare,
  Shield,
  Zap,
} from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">ถามได้คับ</h1>
            </div>
            <Button
              onClick={handleLogin}
              className="bg-blue-500 hover:bg-blue-600"
            >
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className="text-center">
          <h1 className="text-4xl sm:text-6xl font-bold text-gray-900 mb-6">
            AI-Powered
            <span className="text-blue-500">
              {" "}
              Knowledge Management Platform
            </span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Upload, organize, and search your documents with advanced AI
            capabilities. Get instant insights and chat with your documents like
            never before.
          </p>
        </div>
      </section>
      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Everything you need to manage documents
          </h2>
          <p className="text-lg text-gray-600">
            Powerful features to streamline your document workflow
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <Card>
            <CardHeader>
              <Upload className="w-10 h-10 text-blue-500 mb-4" />
              <CardTitle>Smart Upload</CardTitle>
              <CardDescription>
                Drag and drop multiple files with automatic processing and
                classification
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Search className="w-10 h-10 text-green-500 mb-4" />
              <CardTitle>Intelligent Search</CardTitle>
              <CardDescription>
                Find documents instantly with AI-powered search across content
                and metadata
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <MessageSquare className="w-10 h-10 text-purple-500 mb-4" />
              <CardTitle>AI Chat Assistant</CardTitle>
              <CardDescription>
                Ask questions about your documents and get intelligent responses
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="w-10 h-10 text-red-500 mb-4" />
              <CardTitle>Secure & Private</CardTitle>
              <CardDescription>
                Enterprise-grade security with role-based access control
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Zap className="w-10 h-10 text-yellow-500 mb-4" />
              <CardTitle>Auto-Classification</CardTitle>
              <CardDescription>
                AI automatically categorizes and tags your documents for better
                organization
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <FileText className="w-10 h-10 text-indigo-500 mb-4" />
              <CardTitle>Multiple Formats</CardTitle>
              <CardDescription>
                Support for PDF, DOCX, TXT, and image files with content
                extraction
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      {/* <section className="bg-blue-500 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to revolutionize your document management?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join thousands of users who trust DocumentAI for their document
            needs
          </p>
          <Button
            onClick={handleLogin}
            size="lg"
            variant="secondary"
            className="text-lg px-8 py-3"
          >
            Start Your Free Trial
          </Button>
        </div>
      </section> */}

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* <div className="flex items-center justify-center space-x-3">
            <div className="w-6 h-6 bg-blue-500 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-semibold text-gray-900">
              ถามได้คับ
            </span>
          </div> */}
          <p className="text-center text-gray-600 mt-4">
            © 2025 4Plus Consulting Co.,Ltd. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
