"use client";
import React, { useRef, useState } from "react";

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  emotion?: string;
  timestamp: Date;
  audioUrl?: string;
  responseType?: string;
}

interface ResponseOption {
  response: string;
  emotion_stt: string;
  response_type: string;
  audioUrl?: string;
}

// Array of prompts with target emotions for users to speak
const SPEAKING_PROMPTS = [
  { text: "Tell me about your day and how you're feeling right now.", emotion: "happy" },
  { text: "Share something that made you smile recently or something that's been bothering you.", emotion: "happy" },
  { text: "Describe a moment from this week that stood out to you, whether good or bad.", emotion: "sad" },
  { text: "Talk about a challenge you're facing or something you're excited about.", emotion: "angry" },
  { text: "Tell me about someone important in your life and how they make you feel.", emotion: "happy" },
  { text: "Share a memory that brings up strong emotions, whether happy or sad.", emotion: "sad" },
  { text: "Describe how you're feeling about work, school, or your daily routine.", emotion: "angry" },
  { text: "Talk about something you're grateful for or something that's been difficult lately.", emotion: "happy" },
  { text: "Share a recent experience that made you feel proud or disappointed.", emotion: "sad" },
  { text: "Tell me about a goal you're working towards or a fear you're dealing with.", emotion: "angry" },
  { text: "Describe a conversation you had recently that affected your mood.", emotion: "sad" },
  { text: "Share how you're feeling about your relationships with family or friends.", emotion: "happy" },
  { text: "Talk about something you're looking forward to or dreading in the near future.", emotion: "angry" },
  { text: "Describe a place that makes you feel calm or a situation that stresses you out.", emotion: "sad" },
  { text: "Share a recent decision you made and how it's making you feel.", emotion: "angry" },
  { text: "Tell me about a hobby or activity that brings you joy or frustration.", emotion: "happy" },
  { text: "Describe how you're feeling about your health, both physical and mental.", emotion: "sad" },
  { text: "Share something that surprised you recently, whether pleasant or unpleasant.", emotion: "happy" },
  { text: "Talk about a change in your life and how it's affecting your emotions.", emotion: "angry" },
  { text: "Tell me about a dream you had or a hope you're holding onto.", emotion: "happy" }
];

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [emotion, setEmotion] = useState("");
  const [lastDetectedEmotion, setLastDetectedEmotion] = useState("");
  const [lastTargetEmotion, setLastTargetEmotion] = useState("");
  const [emotionMatchStatus, setEmotionMatchStatus] = useState<'correct' | 'incorrect' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [currentResponseOptions, setCurrentResponseOptions] = useState<ResponseOption[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState<string>('');
  const [currentTargetEmotion, setCurrentTargetEmotion] = useState<string>('');
  const [showPromptCard, setShowPromptCard] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Generate session ID on component mount
  React.useEffect(() => {
    const newSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    setSessionId(newSessionId);
  }, []);

  // Function to get a random prompt
  const getRandomPrompt = () => {
    const randomIndex = Math.floor(Math.random() * SPEAKING_PROMPTS.length);
    return SPEAKING_PROMPTS[randomIndex];
  };

  const handleStartRecording = async () => {
    setTranscript("");
    setEmotion("");
    setIsRecording(true);
    setIsLoading(false);
    setEmotionMatchStatus(null); // Clear previous emotion match status
    audioChunksRef.current = [];
    
    // Generate and show a random prompt
    const randomPrompt = getRandomPrompt();
    setCurrentPrompt(randomPrompt.text);
    setCurrentTargetEmotion(randomPrompt.emotion);
    setShowPromptCard(true);
    
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new window.MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };
    mediaRecorder.onstop = handleStopRecording;
    mediaRecorder.start();
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    setIsLoading(true);
    setShowPromptCard(false); // Hide the prompt card when recording stops
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    // Send to backend
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    try {
      const response = await fetch('http://localhost:3001/transcribe', {
        method: 'POST',
        headers: {
          'X-Session-ID': sessionId
        },
        body: formData,
      });
      const data = await response.json();
      const userTranscript = data.transcript || "No transcript received";
      const detectedEmotion = data.emotion || "unknown";
      
      setTranscript(userTranscript);
      setEmotion(detectedEmotion);
      setLastDetectedEmotion(detectedEmotion);
      setLastTargetEmotion(currentTargetEmotion);
      
      // Only show emotion if it matches the target emotion
      const shouldShowEmotion = detectedEmotion.toLowerCase() === currentTargetEmotion.toLowerCase();
      setEmotionMatchStatus(shouldShowEmotion ? 'correct' : 'incorrect');
      
      // Add user message to chat
      const userMessage: ChatMessage = {
        id: Date.now().toString() + '_user',
        type: 'user',
        content: userTranscript,
        emotion: shouldShowEmotion ? detectedEmotion : undefined,
        timestamp: new Date()
      };
      
      // Process multiple response options if available
      if (data.llama_responses && Object.keys(data.llama_responses).length > 0) {
        const responseOptions: ResponseOption[] = [];
        
        // Convert responses to ResponseOption format with audio URLs
        Object.entries(data.llama_responses).forEach(([responseType, responseData]) => {
          const response = responseData as {response: string, emotion_stt: string, response_type: string};
          let audioUrl: string | undefined;
          if (data.tts_audio && data.tts_audio[responseType] && data.tts_audio[responseType].success && data.tts_audio[responseType].audio_base64) {
            audioUrl = `data:audio/mp3;base64,${data.tts_audio[responseType].audio_base64}`;
          }
          
          responseOptions.push({
            response: response.response,
            emotion_stt: response.emotion_stt,
            response_type: response.response_type,
            audioUrl: audioUrl
          });
        });
        
        setCurrentResponseOptions(responseOptions);
        setChatMessages(prev => [...prev, userMessage]);
        
        // Auto-play the first response audio if available
        if (responseOptions.length > 0 && responseOptions[0].audioUrl) {
          setTimeout(() => {
            const audio = new Audio(responseOptions[0].audioUrl!);
            audio.play().catch(err => console.log('Auto-play prevented:', err));
          }, 500); // Small delay to ensure UI is updated
        }
      } else {
        setChatMessages(prev => [...prev, userMessage]);
        setCurrentResponseOptions([]);
      }
      
      setIsLoading(false);
    } catch (err) {
      setTranscript("Error transcribing audio");
      setEmotion("unknown");
      setIsLoading(false);
      console.error("Error transcribing audio:", err);
      
      // Add error message to chat
      const errorMessage: ChatMessage = {
        id: Date.now().toString() + '_error',
        type: 'assistant',
        content: "Sorry, I couldn't process your audio. Please try again.",
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    }
  };

  const getEmotionEmoji = (emotion: string) => {
    switch (emotion.toLowerCase()) {
      case 'happy': return '😊';
      case 'sad': return '😢';
      case 'angry': return '😠';
      case 'neutral': return '😐';
      case 'excited': return '🤩';
      case 'calm': return '😌';
      case 'worried': return '😟';
      case 'surprised': return '😲';
      case 'fearful': return '😨';
      case 'disgusted': return '🤢';
      default: return '🤔';
    }
  };

  const handleMicClick = () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
    } else {
      handleStartRecording();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderChatMessage = (message: ChatMessage) => {
    const isUser = message.type === 'user';
    
    const playAudio = (audioUrl: string) => {
      const audio = new Audio(audioUrl);
      audio.play().catch(err => console.log('Audio play error:', err));
    };
    
    return (
      <div
        key={message.id}
        style={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            maxWidth: '70%',
            padding: '12px 16px',
            borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            background: isUser ? '#007AFF' : '#F2F2F7',
            color: isUser ? '#fff' : '#000',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          {message.emotion && isUser && (
            <div style={{
              fontSize: '18px',
              opacity: 0.8,
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              {getEmotionEmoji(message.emotion)} {message.emotion}
            </div>
          )}
          <div style={{
            fontSize: '16px',
            lineHeight: '1.4'
          }}>
            {message.content}
          </div>
          
          {/* Audio play button for assistant messages */}
          {!isUser && message.audioUrl && (
            <div style={{
              marginTop: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <button
                onClick={() => playAudio(message.audioUrl!)}
                style={{
                  background: '#007AFF',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
                title="Play audio"
              >
                🔊
              </button>
              <span style={{ fontSize: '12px', color: '#666' }}>Listen</span>
            </div>
          )}
          
          <div style={{
            fontSize: '11px',
            opacity: 0.6,
            marginTop: '4px',
            textAlign: 'right'
          }}>
            {formatTime(message.timestamp)}
          </div>
        </div>
      </div>
    );
  };

  const selectResponseOption = (option: ResponseOption) => {
    // Add the selected response to chat
    const assistantMessage: ChatMessage = {
      id: Date.now().toString() + '_assistant',
      type: 'assistant',
      content: option.response,
      emotion: option.emotion_stt,
      responseType: option.response_type,
      timestamp: new Date(),
      audioUrl: option.audioUrl
    };
    
    setChatMessages(prev => [...prev, assistantMessage]);
    setCurrentResponseOptions([]); // Clear the options after selection
    
    // Auto-play the selected response audio if available
    if (option.audioUrl) {
      setTimeout(() => {
        const audio = new Audio(option.audioUrl!);
        audio.play().catch(err => console.log('Auto-play prevented:', err));
      }, 100);
    }
  };

  const clearChat = async () => {
    try {
      // Clear backend context
      await fetch('http://localhost:3001/clear-context', {
        method: 'POST',
        headers: {
          'X-Session-ID': sessionId,
          'Content-Type': 'application/json'
        }
      });
      
      // Clear frontend state
      setChatMessages([]);
      setTranscript("");
      setEmotion("");
      setCurrentResponseOptions([]);
      setEmotionMatchStatus(null);
      setLastDetectedEmotion("");
      setLastTargetEmotion("");
      
      // Generate new session ID
      const newSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      setSessionId(newSessionId);
    } catch (error) {
      console.error('Error clearing context:', error);
      // Still clear frontend state even if backend call fails
      setChatMessages([]);
      setTranscript("");
      setEmotion("");
      setCurrentResponseOptions([]);
      setEmotionMatchStatus(null);
      setLastDetectedEmotion("");
      setLastTargetEmotion("");
    }
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f5f6fa',
      overflow: 'hidden'
    }}>
      {/* Header - Fixed */}
      <div style={{
        padding: '20px',
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#333'
        }}>
          🎧 Emotion Chat Assistant
        </h1>
        {chatMessages.length > 0 && (
          <button
            onClick={clearChat}
            style={{
              background: '#FF6B6B',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Clear Chat
          </button>
        )}
      </div>

      {/* Prompt Card - Shows when recording */}
      {showPromptCard && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000,
          background: '#fff',
          borderRadius: '20px',
          padding: '30px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          maxWidth: '900px',
          width: '90%',
          textAlign: 'center',
          border: '3px solid #007AFF',
          animation: 'fadeInScale 0.3s ease-out'
        }}>
          <div style={{
            fontSize: '24px',
            marginBottom: '20px',
            color: '#007AFF'
          }}>
            🎤 Speak Now
          </div>
          
          {/* Large emotion emoji */}
          <div style={{
            fontSize: '80px',
            marginBottom: '10px',
            animation: 'bounce 2s infinite'
          }}>
            {getEmotionEmoji(currentTargetEmotion)}
          </div>
          
          <div style={{
            fontSize: '26px',
            color: '#666',
            marginBottom: '20px',
            fontWeight: '700',
            textTransform: 'capitalize'
          }}>
            {currentTargetEmotion} emotion
          </div>
          
          <div style={{
            fontSize: '40px',
            lineHeight: '1.5',
            color: '#333',
            marginBottom: '20px',
            fontWeight: '500',
            fontFamily: 'Quicksand_, sans-serif'
          }}>
            {currentPrompt}
          </div>
          
          <div style={{
            fontSize: '14px',
            color: '#666',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
            <div style={{
              width: 12,
              height: 12,
              background: '#e84118',
              borderRadius: '50%',
              animation: 'pulse 1.5s infinite'
            }}></div>
            Recording in progress...
          </div>
        </div>
      )}

      {/* Chat Container - Takes remaining space */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        maxWidth: '800px',
        margin: '0 auto',
        width: '100%',
        padding: '0 20px',
        overflow: 'hidden'
      }}>
        {/* Messages Area - Scrollable */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 0',
          minHeight: 0
        }}>
          {chatMessages.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              textAlign: 'center',
              color: '#666'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎙️</div>
              <h2 style={{ margin: '0 0 8px 0', color: '#333' }}>Welcome to Emotion Chat!</h2>
              <p style={{ margin: 0, fontSize: '16px' }}>
                Click the microphone button below to start a conversation.
                <br />
                I&apos;ll detect your emotion and respond with comfort and support.
              </p>
            </div>
          ) : (
            <div>
              {/* Emotion Match Status Feedback */}
              {emotionMatchStatus && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginBottom: '16px'
                }}>
                  <div style={{
                    padding: '12px 20px',
                    borderRadius: '20px',
                    background: emotionMatchStatus === 'correct' 
                      ? 'linear-gradient(135deg, #4CAF50, #45A049)'
                      : 'linear-gradient(135deg, #FF9800, #F57C00)',
                    color: '#fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}>
                    {emotionMatchStatus === 'correct' ? (
                      <>
                        <span style={{ fontSize: '18px' }}>✅</span>
                        Emotion correctly detected: {getEmotionEmoji(lastDetectedEmotion)} {lastDetectedEmotion}
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '18px' }}>ℹ️</span>
                        Target: {getEmotionEmoji(lastTargetEmotion)} {lastTargetEmotion} | 
                        Detected: {getEmotionEmoji(lastDetectedEmotion)} {lastDetectedEmotion}
                      </>
                    )}
                  </div>
                </div>
              )}
              
              {chatMessages.map(renderChatMessage)}
              
              {/* Response Options */}
              {currentResponseOptions.length > 0 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-start',
                  marginBottom: '16px',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{
                    fontSize: '14px',
                    color: '#666',
                    marginBottom: '8px',
                    fontWeight: '500'
                  }}>
                    Choose a response type:
                  </div>
                  {currentResponseOptions.map((option, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-start',
                        marginBottom: '8px'
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '70%',
                          padding: '12px 16px',
                          borderRadius: '18px 18px 18px 4px',
                          background: '#E3F2FD',
                          border: '2px solid #2196F3',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          boxShadow: '0 2px 8px rgba(33, 150, 243, 0.2)'
                        }}
                        onClick={() => selectResponseOption(option)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#BBDEFB';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#E3F2FD';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        <div style={{
                          fontSize: '12px',
                          color: '#1976D2',
                          marginBottom: '4px',
                          fontWeight: '600',
                          textTransform: 'capitalize'
                        }}>
                          {option.response_type} Response
                        </div>
                        <div style={{
                          fontSize: '16px',
                          lineHeight: '1.4',
                          color: '#333',
                          marginBottom: '8px'
                        }}>
                          {option.response}
                        </div>
                        
                        {/* Audio play button */}
                        {option.audioUrl && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const audio = new Audio(option.audioUrl!);
                                audio.play().catch(err => console.log('Audio play error:', err));
                              }}
                              style={{
                                background: '#2196F3',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '50%',
                                width: '28px',
                                height: '28px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                              title="Play audio"
                            >
                              🔊
                            </button>
                            <span style={{ fontSize: '11px', color: '#1976D2' }}>Listen</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {isLoading && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-start',
                  marginBottom: '16px'
                }}>
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '18px 18px 18px 4px',
                    background: '#F2F2F7',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <div style={{
                      width: 16,
                      height: 16,
                      border: '2px solid #007AFF',
                      borderTop: '2px solid transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }}></div>
                    <span style={{ color: '#666' }}>Processing your message...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recording Controls - Fixed at bottom */}
        <div style={{
          padding: '20px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.1)',
          flexShrink: 0
        }}>
          {isRecording && (
            <div style={{
              fontSize: '18px',
              color: '#e84118',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <div style={{
                width: 12,
                height: 12,
                background: '#e84118',
                borderRadius: '50%',
                animation: 'pulse 1.5s infinite'
              }}></div>
              Listening...
            </div>
          )}
          
          <button
            onClick={handleMicClick}
            disabled={isLoading}
            style={{
              background: isRecording ? '#e84118' : (isLoading ? '#ccc' : '#007AFF'),
              border: 'none',
              borderRadius: '50%',
              width: 80,
              height: 80,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              transform: isRecording ? 'scale(1.1)' : 'scale(1)',
            }}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3" fill={isRecording ? '#fff' : 'none'} />
              <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
              <line x1="12" y1="22" x2="12" y2="18" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
          </button>
          
          <div style={{
            fontSize: '14px',
            color: '#666',
            textAlign: 'center'
          }}>
            {isLoading 
              ? "Processing..." 
              : isRecording 
                ? "Tap to stop recording" 
                : "Tap to start recording"
            }
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        @keyframes fadeInScale {
          0% { 
            opacity: 0; 
            transform: translate(-50%, -50%) scale(0.8); 
          }
          100% { 
            opacity: 1; 
            transform: translate(-50%, -50%) scale(1); 
          }
        }
        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-10px);
          }
          60% {
            transform: translateY(-5px);
          }
        }
      `}</style>
    </div>
  );
}
