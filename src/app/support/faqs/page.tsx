'use client';

import { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, Search, ThumbsUp, ThumbsDown } from 'lucide-react';

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  helpful: number;
  notHelpful: number;
}

const mockFAQs: FAQ[] = [
  {
    id: '1',
    question: 'How do I schedule my first appointment?',
    answer: 'To schedule your first appointment, log into your account and navigate to the "Appointments" section. Click "Schedule New Appointment", select your preferred provider, choose an available time slot, and confirm your booking. You\'ll receive a confirmation email with appointment details.',
    category: 'Appointments',
    helpful: 234,
    notHelpful: 12
  },
  {
    id: '2',
    question: 'What insurance plans does EONPRO accept?',
    answer: 'EONPRO accepts most major insurance plans including Medicare, Medicaid, Blue Cross Blue Shield, Aetna, Cigna, United Healthcare, and more. You can verify your specific coverage by entering your insurance information in the "Insurance" section of your profile or contacting our support team.',
    category: 'Billing & Insurance',
    helpful: 456,
    notHelpful: 23
  },
  {
    id: '3',
    question: 'How do I join a video consultation?',
    answer: 'When it\'s time for your appointment, you\'ll receive an email reminder with a "Join Video Call" button. You can also access the video call from your dashboard. Make sure you have a stable internet connection, webcam, and microphone enabled. We recommend using Chrome, Firefox, or Safari browsers.',
    category: 'Technical',
    helpful: 189,
    notHelpful: 8
  },
  {
    id: '4',
    question: 'Is my health information secure?',
    answer: 'Yes, EONPRO is fully HIPAA-compliant. We use industry-standard encryption for all data transmission and storage. Your health information is protected with AES-256 encryption, secure access controls, and regular security audits. Only authorized healthcare providers have access to your medical records.',
    category: 'Privacy & Security',
    helpful: 567,
    notHelpful: 15
  },
  {
    id: '5',
    question: 'Can I get prescriptions through telemedicine?',
    answer: 'Yes, licensed providers can prescribe medications through our telemedicine platform when medically appropriate. Prescriptions are sent directly to your preferred pharmacy. Note that certain controlled substances cannot be prescribed via telemedicine due to federal regulations.',
    category: 'Medical Services',
    helpful: 321,
    notHelpful: 19
  },
  {
    id: '6',
    question: 'What if I need to cancel or reschedule?',
    answer: 'You can cancel or reschedule appointments up to 24 hours before the scheduled time without any fees. Go to your appointments page, select the appointment, and choose "Cancel" or "Reschedule". Cancellations within 24 hours may incur a fee as per our cancellation policy.',
    category: 'Appointments',
    helpful: 278,
    notHelpful: 11
  },
  {
    id: '7',
    question: 'How do I update my payment information?',
    answer: 'To update your payment information, go to Settings > Billing & Payments. Click "Update Payment Method" and enter your new card details. Your information is securely processed through our PCI-compliant payment system.',
    category: 'Billing & Insurance',
    helpful: 145,
    notHelpful: 7
  },
  {
    id: '8',
    question: 'What devices can I use for video consultations?',
    answer: 'You can use any device with a camera and microphone including smartphones (iOS/Android), tablets, laptops, and desktop computers. For the best experience, ensure you have a stable internet connection and use an updated browser or our mobile app.',
    category: 'Technical',
    helpful: 198,
    notHelpful: 9
  }
];

const categories = ['All', 'Appointments', 'Billing & Insurance', 'Technical', 'Medical Services', 'Privacy & Security'];

export default function FAQsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [expandedFAQs, setExpandedFAQs] = useState<Set<string>>(new Set());
  const [helpfulVotes, setHelpfulVotes] = useState<Record<string, 'helpful' | 'not' | null>>({});

  const filteredFAQs = mockFAQs.filter(faq => {
    const matchesSearch = faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleFAQ = (id: string) => {
    const newExpanded = new Set(expandedFAQs);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedFAQs(newExpanded);
  };

  const handleHelpfulVote = (faqId: string, vote: 'helpful' | 'not') => {
    setHelpfulVotes({ ...helpfulVotes, [faqId]: vote });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center mb-4">
          <HelpCircle className="w-8 h-8 text-blue-600 mr-3" />
          <h1 className="text-2xl font-bold">Frequently Asked Questions</h1>
        </div>
        <p className="text-gray-600">
          Find quick answers to common questions about EONPRO
        </p>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search FAQs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  selectedCategory === category
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-blue-600">{mockFAQs.length}</div>
          <div className="text-gray-600">Total FAQs</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-green-600">
            {Math.round(mockFAQs.reduce((acc, faq) => acc + faq.helpful, 0) / mockFAQs.length)}
          </div>
          <div className="text-gray-600">Avg. Helpful Votes</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-purple-600">{categories.length - 1}</div>
          <div className="text-gray-600">Categories</div>
        </div>
      </div>

      {/* FAQs List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">
            {selectedCategory === 'All' ? 'All FAQs' : selectedCategory} ({filteredFAQs.length})
          </h2>
        </div>
        <div className="divide-y">
          {filteredFAQs.map(faq => (
            <div key={faq.id} className="p-6">
              <button
                onClick={() => toggleFAQ(faq.id)}
                className="w-full flex items-start justify-between text-left hover:bg-gray-50 -m-2 p-2 rounded"
              >
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900 mb-1">{faq.question}</h3>
                  <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {faq.category}
                  </span>
                </div>
                {expandedFAQs.has(faq.id) ? (
                  <ChevronUp className="w-5 h-5 text-gray-400 ml-4 flex-shrink-0 mt-1" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400 ml-4 flex-shrink-0 mt-1" />
                )}
              </button>
              
              {expandedFAQs.has(faq.id) && (
                <div className="mt-4 space-y-4">
                  <p className="text-gray-600 leading-relaxed">{faq.answer}</p>
                  
                  <div className="flex items-center gap-4 pt-4 border-t">
                    <span className="text-sm text-gray-500">Was this helpful?</span>
                    <button
                      onClick={() => handleHelpfulVote(faq.id, 'helpful')}
                      className={`flex items-center gap-1 px-3 py-1 rounded transition-colors ${
                        helpfulVotes[faq.id] === 'helpful'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <ThumbsUp className="w-4 h-4" />
                      <span className="text-sm">{faq.helpful}</span>
                    </button>
                    <button
                      onClick={() => handleHelpfulVote(faq.id, 'not')}
                      className={`flex items-center gap-1 px-3 py-1 rounded transition-colors ${
                        helpfulVotes[faq.id] === 'not'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <ThumbsDown className="w-4 h-4" />
                      <span className="text-sm">{faq.notHelpful}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Still Need Help */}
      <div className="bg-blue-50 rounded-lg p-6 text-center">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          Can't find what you're looking for?
        </h3>
        <p className="text-blue-700 mb-4">
          Our support team is here to help you with any questions
        </p>
        <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          Contact Support
        </button>
      </div>
    </div>
  );
}
