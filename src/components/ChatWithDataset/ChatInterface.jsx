import React, { useState, useRef, useEffect } from 'react';
import { FiSend, FiDownload, FiCopy, FiInfo } from 'react-icons/fi';
import { useAIFeatures } from '../../hooks';
import './ChatWithDataset.css';
import PropTypes from 'prop-types';

/**
 * Chat interface for interacting with a dataset using natural language
 */
const ChatInterface = ({ fileId, filename }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  
  const { sendChatMessage, chatLoading, chatError } = useAIFeatures();
  
  // Add a welcome message when the component mounts
  useEffect(() => {
    if (filename) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `Hello! I'm your data assistant for "${filename}". Ask me anything about this dataset.`,
          timestamp: new Date().toISOString()
        }
      ]);
    }
  }, [filename]);

  // Automatically scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus management - keep input focused
  useEffect(() => {
    // Focus input on mount
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Re-focus input after sending message
  useEffect(() => {
    if (!chatLoading && inputRef.current) {
      // Small delay to ensure the message is processed
      setTimeout(() => {
        inputRef.current.focus();
      }, 100);
    }
  }, [chatLoading]);

  // Handle window focus - refocus input when user comes back to tab
  useEffect(() => {
    const handleWindowFocus = () => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Send a message to the AI service
  const sendMessageToAI = async (message) => {
    try {
      // Filter out the welcome message to create chat history
      const history = messages
        .filter(msg => msg.id !== 'welcome')
        .map(({ role, content }) => ({ role, content }));
      
      // Call the AI service through our hook
      const result = await sendChatMessage(fileId, message, history);
      
      // Create the AI response message
      const aiResponse = {
        id: `resp-${Date.now()}`,
        role: 'assistant',
        content: result.response,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      console.error('Error sending message to AI:', error);
      
      // Add an error message
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'error',
          content: chatError || 'Sorry, there was an error processing your request. Please try again later.',
          timestamp: new Date().toISOString()
        }
      ]);
    }
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    
    if (!inputMessage.trim()) return;
    
    const newMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: inputMessage,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, newMessage]);
    const messageToSend = inputMessage;
    setInputMessage('');
    
    // Keep focus on input while sending message
    if (inputRef.current) {
      inputRef.current.focus();
    }
    
    await sendMessageToAI(messageToSend);
  };

  // Handle clicks in the chat area to maintain focus
  const handleChatAreaClick = () => {
    if (inputRef.current && !chatLoading) {
      inputRef.current.focus();
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleCopyMessage = (content) => {
    navigator.clipboard.writeText(content);
    // Could add a notification here
  };

  const handleDownloadChat = () => {
    const chatText = messages
      .map(msg => `[${formatTimestamp(msg.timestamp)}] ${msg.role === 'user' ? 'You' : 'AI'}: ${msg.content}`)
      .join('\n\n');
    
    const blob = new Blob([chatText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${filename}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="chat-interface-container" onClick={handleChatAreaClick}>
      <div className="chat-header">
        <h3>Chat with Dataset</h3>
        {messages.length > 1 && (
          <button className="download-button" onClick={handleDownloadChat}>
            <FiDownload /> Save Chat
          </button>
        )}
      </div>
      
      <div className="messages-container">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`message-bubble ${msg.role === 'user' ? 'user-message' : msg.role === 'error' ? 'error-message' : 'ai-message'}`}
          >
            <div className="message-content">{msg.content}</div>
            <div className="message-footer">
              <span className="message-timestamp">{formatTimestamp(msg.timestamp)}</span>
              {msg.role !== 'error' && (
                <button 
                  className="copy-button" 
                  onClick={() => handleCopyMessage(msg.content)}
                  title="Copy to clipboard"
                >
                  <FiCopy />
                </button>
              )}
            </div>
          </div>
        ))}
        {chatLoading && (
          <div className="message-bubble ai-message loading-message">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form className="chat-input-container" onSubmit={handleSendMessage}>
        <input 
          ref={inputRef}
          type="text" 
          value={inputMessage} 
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Ask about your dataset..."
          disabled={chatLoading}
          autoFocus
        />
        <button 
          type="submit" 
          className="send-button"
          disabled={chatLoading || !inputMessage.trim()}
        >
          <FiSend />
        </button>
      </form>
      
      <div className="chat-footer">
        <div className="info-message">
          <FiInfo />
          <span>Ask questions about column statistics, data quality, or patterns in your dataset.</span>
        </div>
      </div>
    </div>
  );
};
ChatInterface.propTypes = {
  fileId: PropTypes.string.isRequired,
  filename: PropTypes.string
};

ChatInterface.defaultProps = {
  filename: ''
};
export default ChatInterface;
