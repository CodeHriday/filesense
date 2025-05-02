import React, { useState, useRef, useEffect } from 'react';
import { FiSend, FiDownload, FiCopy, FiInfo } from 'react-icons/fi';
import './ChatWithDataset.css';

/**
 * Chat interface for interacting with a dataset using natural language
 */
const ChatInterface = ({ fileId, filename }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Mock function for sending a message to the AI
  // In a real implementation, this would call the backend API
  const sendMessageToAI = async (message) => {
    setIsLoading(true);
    
    try {
      // This is a placeholder for the actual API call
      // In real implementation, we would call the backend endpoint
      
      // Simulating a network delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Placeholder for the actual AI response
      const aiResponse = {
        id: `resp-${Date.now()}`,
        role: 'assistant',
        content: `This is a placeholder response. The backend API for the chat interface is still under implementation. Your question was: "${message}"`,
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
          content: 'Sorry, there was an error processing your request. Please try again later.',
          timestamp: new Date().toISOString()
        }
      ]);
    } finally {
      setIsLoading(false);
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
    setInputMessage('');
    
    await sendMessageToAI(inputMessage);
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
    <div className="chat-interface-container">
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
        {isLoading && (
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
          type="text" 
          value={inputMessage} 
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Ask about your dataset..."
          disabled={isLoading}
        />
        <button 
          type="submit" 
          className="send-button"
          disabled={isLoading || !inputMessage.trim()}
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

export default ChatInterface;
