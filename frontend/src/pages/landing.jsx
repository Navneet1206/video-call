import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Users, Shield, ArrowRight, Mail, Phone, MapPin, Send } from 'lucide-react';

export default function LandingPage() {
  const [meetingCode, setMeetingCode] = useState('');
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' });
  const [formStatus, setFormStatus] = useState({ loading: false, success: null, error: null });
  const navigate = useNavigate();

  const handleJoin = () => {
    if (meetingCode.trim() !== '') {
      navigate(`/${meetingCode}`);
    }
  };

  const handleContactChange = (e) => {
    const { name, value } = e.target;
    setContactForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    const { name, email, message } = contactForm;

    // Client-side validation
    if (!name.trim() || !email.trim() || !message.trim()) {
      setFormStatus({ loading: false, success: null, error: 'All fields are required.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormStatus({ loading: false, success: null, error: 'Invalid email address.' });
      return;
    }

    setFormStatus({ loading: true, success: null, error: null });

    try {
      const response = await fetch('http://localhost:8000/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });

      if (response.ok) {
        setFormStatus({ loading: false, success: 'Message sent successfully!', error: null });
        setContactForm({ name: '', email: '', message: '' });
      } else {
        const errorData = await response.json();
        setFormStatus({ loading: false, success: null, error: errorData.message || 'Failed to send message.' });
      }
    } catch (error) {
      setFormStatus({ loading: false, success: null, error: 'An error occurred. Please try again.' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="bg-white shadow-sm fixed w-full z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Video className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-800">VideoMeet</h1>
          </div>
          <nav className="flex gap-6">
            <a href="#features" className="text-gray-600 hover:text-blue-600 transition">Features</a>
            <a href="#about" className="text-gray-600 hover:text-blue-600 transition">About</a>
            <a href="#contact" className="text-gray-600 hover:text-blue-600 transition">Contact</a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-24 pb-16 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-center gap-12">
          <div className="lg:w-1/2 text-center lg:text-left">
            <h2 className="text-4xl md:text-5xl font-extrabold mb-6 leading-tight">
              Connect Seamlessly with VideoMeet
            </h2>
            <p className="text-lg mb-8">
              Join or host high-quality video meetings with ease. Secure, reliable, and built for teams of all sizes.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <input
                type="text"
                className="w-full sm:w-64 p-3 bg-white text-gray-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Enter Meeting Code"
                value={meetingCode}
                onChange={(e) => setMeetingCode(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
              />
              <button
                className="px-6 py-3 bg-white text-blue-600 font-semibold rounded-lg shadow-md hover:bg-gray-100 transition duration-300 flex items-center gap-2"
                onClick={handleJoin}
              >
                Join Meeting <ArrowRight size={20} />
              </button>
            </div>
          </div>
          <div className="lg:w-1/2">
            <img
              src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1350&q=80"
              alt="Team video meeting"
              className="w-full rounded-lg shadow-xl transform hover:scale-105 transition duration-500"
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 text-center mb-12">
            Why Choose VideoMeet?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-6 bg-gray-50 rounded-lg shadow-md hover:shadow-lg transition duration-300">
              <Video className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Crystal-Clear Video</h3>
              <p className="text-gray-600">
                Experience HD video and audio for seamless communication, even on low bandwidth.
              </p>
            </div>
            <div className="text-center p-6 bg-gray-50 rounded-lg shadow-md hover:shadow-lg transition duration-300">
              <Users className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Team Collaboration</h3>
              <p className="text-gray-600">
                Share screens, chat, and collaborate with up to 100 participants in real-time.
              </p>
            </div>
            <div className="text-center p-6 bg-gray-50 rounded-lg shadow-md hover:shadow-lg transition duration-300">
              <Shield className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Secure & Private</h3>
              <p className="text-gray-600">
                End-to-end encryption ensures your meetings are safe and confidential.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-16 bg-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-center gap-12">
          <div className="lg:w-1/2">
            <img
              src="https://images.unsplash.com/photo-1516321310764-7f716c296a6e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1350&q=80"
              alt="Team collaboration"
              className="w-full rounded-lg shadow-xl transform hover:scale-105 transition duration-500"
            />
          </div>
          <div className="lg:w-1/2">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-6">About VideoMeet</h2>
            <p className="text-lg text-gray-600 mb-4">
              VideoMeet is designed to make virtual meetings effortless and productive. Whether you're connecting with colleagues, clients, or friends, our platform delivers a reliable and intuitive experience.
            </p>
            <p className="text-lg text-gray-600">
              Built with cutting-edge WebRTC technology, VideoMeet ensures low-latency, high-quality video calls with robust security features to keep your conversations private.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Us Section */}
      <section id="contact" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 text-center mb-12">
            Get in Touch
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <h3 className="text-2xl font-semibold text-gray-800 mb-4">Send Us a Message</h3>
              <p className="text-gray-600 mb-6">
                Have questions or need support? Fill out the form, and we'll get back to you promptly.
              </p>
              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Your Name"
                    value={contactForm.name}
                    onChange={handleContactChange}
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Your Email"
                    value={contactForm.email}
                    onChange={handleContactChange}
                  />
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700">
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows="4"
                    className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Your Message"
                    value={contactForm.message}
                    onChange={handleContactChange}
                  ></textarea>
                </div>
                <button
                  type="submit"
                  className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition duration-300 flex items-center justify-center gap-2"
                  disabled={formStatus.loading}
                >
                  {formStatus.loading ? (
                    <span className="animate-pulse">Sending...</span>
                  ) : (
                    <>
                      Send Message <Send size={20} />
                    </>
                  )}
                </button>
                {formStatus.success && (
                  <p className="text-green-600 text-center">{formStatus.success}</p>
                )}
                {formStatus.error && (
                  <p className="text-red-600 text-center">{formStatus.error}</p>
                )}
              </form>
            </div>
            <div className="flex flex-col justify-center">
              <img
                src="https://images.unsplash.com/photo-1596526131083-5ce56acf4011?ixlib=rb-4.0.3&auto=format&fit=crop&w=1350&q=80"
                alt="Customer support team"
                className="w-full rounded-lg shadow-xl transform hover:scale-105 transition duration-500 mb-6"
              />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Mail size={24} className="text-blue-600" />
                  <a href="mailto:support@videomeet.com" className="text-gray-600 hover:text-blue-600">
                    support@videomeet.com
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={24} className="text-blue-600" />
                  <a href="tel:+1234567890" className="text-gray-600 hover:text-blue-600">
                    +1 (234) 567-890
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={24} className="text-blue-600" />
                  <span className="text-gray-600">123 Virtual Way, Tech City</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Get Started?</h2>
          <p className="text-lg mb-8">
            Join a meeting now or create your own with just a code.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <input
              type="text"
              className="w-full sm:w-64 p-3 bg-white text-gray-800 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Enter Meeting Code"
              value={meetingCode}
              onChange={(e) => setMeetingCode(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button
              className="px-6 py-3 bg-white text-blue-600 font-semibold rounded-lg shadow-md hover:bg-gray-100 transition duration-300 flex items-center gap-2 mx-auto sm:mx-0"
              onClick={handleJoin}
            >
              Join Now <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-xl font-semibold mb-4">VideoMeet</h3>
              <p className="text-gray-400">
                Connecting people through seamless video communication.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4">Contact Us</h3>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <Mail size={20} className="text-blue-400" />
                  <a href="mailto:support@videomeet.com" className="text-gray-400 hover:text-blue-400">
                    support@videomeet.com
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Phone size={20} className="text-blue-400" />
                  <a href="tel:+1234567890" className="text-gray-400 hover:text-blue-400">
                    +1 (234) 567-890
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <MapPin size={20} className="text-blue-400" />
                  <span className="text-gray-400">123 Virtual Way, Tech City</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4">Quick Links</h3>
              <ul className="space-y-2">
                <li>
                  <a href="#features" className="text-gray-400 hover:text-blue-400">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#about" className="text-gray-400 hover:text-blue-400">
                    About
                  </a>
                </li>
                <li>
                  <a href="#contact" className="text-gray-400 hover:text-blue-400">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-gray-700 pt-6 text-center">
            <p className="text-gray-400">
              © {new Date().getFullYear()} VideoMeet. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}