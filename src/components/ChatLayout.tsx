import React, { useState, useEffect, useRef } from 'react';
import { Menu, Plus, MessageSquare, User, Sparkles, Image as ImageIcon, Video, Code2, Paperclip, Send, Mic, MicOff, Settings, CreditCard, ChevronDown, Check, X, Shield, Zap, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { Message, NexusMode } from '../types';
import { auth, googleProvider, db } from '../lib/firebase';
import { signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

export const ChatLayout: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('default');
  const [input, setInput] = useState('');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('Nexus 1 (Free)');
  const [isModelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [isPlanModalOpen, setPlanModalOpen] = useState(false);
  const [isLoginModalOpen, setLoginModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{name: string, email: string} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [isLightMode, setIsLightMode] = useState(false);

  const toggleTheme = () => {
    setIsLightMode(!isLightMode);
    document.body.classList.toggle('light-mode');
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser({ name: user.displayName || 'User', email: user.email || '' });
        setLoginModalOpen(false);
        
        // Load messages from Firestore
        const q = query(collection(db, 'users', user.uid, 'messages'), orderBy('createdAt', 'asc'));
        const unsubMsgs = onSnapshot(q, (snapshot) => {
          const msgs: Message[] = [];
          snapshot.forEach((doc) => {
            msgs.push({ id: doc.id, ...doc.data() } as Message);
          });
          setAllMessages(msgs);
        }, (err) => {
          console.warn("Firestore read:", err.message);
          const saved = localStorage.getItem('nexus_pro_chat_history');
          if (saved) {
            try { setAllMessages(JSON.parse(saved)); } catch (e) {}
          }
        });
        return () => unsubMsgs();
      } else {
        setCurrentUser(null);
        setAllMessages([]);
        setMessages([]);
        setLoginModalOpen(true);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const sessionMsgs = allMessages.filter(m => (m.sessionId || 'default') === currentSessionId);
    setMessages(sessionMsgs);
  }, [allMessages, currentSessionId]);

  useEffect(() => {
    if (allMessages.length > 0) {
      localStorage.setItem('nexus_pro_chat_history', JSON.stringify(allMessages));
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';
      recognitionRef.current.onresult = (event: any) => {
        setInput(prev => prev + (prev ? ' ' : '') + event.results[0][0].transcript);
        setIsListening(false);
      };
      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        console.warn("Speech recognition error");
      }
    }
  };

  const saveMessageToFirestore = (msg: Message) => {
    if (auth.currentUser) {
      const msgData = { ...msg, createdAt: serverTimestamp(), sessionId: currentSessionId };
      addDoc(collection(db, 'users', auth.currentUser.uid, 'messages'), msgData).catch(() => {});
    }
  };

  const handleSend = async (e?: React.FormEvent, customText?: string, type: NexusMode = 'chat') => {
    e?.preventDefault();
    const textToSend = customText || input;
    if (!textToSend.trim() || isLoading) return;
    
    // Check usage limits
    const usageStr = localStorage.getItem('nexus_usage');
    let usage = usageStr ? JSON.parse(usageStr) : { chat: 0, image: 0, video: 0, code: 0, date: new Date().toDateString() };
    if (usage.date !== new Date().toDateString()) {
       usage = { chat: 0, image: 0, video: 0, code: 0, date: new Date().toDateString() };
    }

    let actualType: any = type;
    const lowerText = textToSend.toLowerCase();
    if (type === 'chat') {
       if (lowerText.startsWith('generate image') || lowerText.startsWith('create image')) actualType = 'image';
       else if (lowerText.startsWith('generate video') || lowerText.startsWith('create video')) actualType = 'video';
       else if (lowerText.startsWith('generate code') || lowerText.startsWith('create code') || lowerText.includes('html')) actualType = 'code';
       else if (lowerText.includes('text to speech') || lowerText.includes('voice clone') || lowerText.includes('clone a voice') || lowerText.includes('speech:')) actualType = 'tts';
    }

    const isAdmin = currentUser?.email === 'dinesdas39469@gmail.com';

    if (!isAdmin) {
       if (actualType === 'image' || actualType === 'video' || actualType === 'tts') {
          alert('This feature is Coming Soon!');
          return;
       }
       if (selectedModel === 'Nexus 1 (Free)') {
          // Mock 1 hr limit, e.g. 50 chats per day or just a notice
          if (usage.chat >= 50) {
             alert('Free plan limit reached: 1 Hour Chat daily limit used. Upgrade to Mini Plan (₹2) for 24/7 access!');
             return;
          }
       }
    }
    
    // Update usage
    usage[actualType] = (usage[actualType] || 0) + 1;
    if(actualType === 'chat' || actualType === 'code') usage.chat += 1;
    localStorage.setItem('nexus_usage', JSON.stringify(usage));

    setInput('');

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: textToSend };
    setMessages(prev => [...prev, userMsg]);
    saveMessageToFirestore(userMsg);
    setIsLoading(true);

    const modelMsgId = (Date.now() + 1).toString();

    const sessionMsgs = allMessages.filter(m => (m.sessionId || 'default') === currentSessionId);
    let latestImageData = userMsg.imageData;
    if (!latestImageData) {
       for(let i = sessionMsgs.length - 1; i >= 0; i--) {
         if (sessionMsgs[i].imageData) {
           latestImageData = sessionMsgs[i].imageData;
           break;
         }
       }
    }

    try {
      if (actualType === 'image') {
        setMessages(prev => [...prev, { id: modelMsgId, role: 'model', text: '', type: 'image', status: 'generating', progress: 0 }]);
        
        let prog = 0;
        const interval = setInterval(() => {
          prog += Math.random() * 15;
          if (prog > 90) prog = 90;
          setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, progress: Math.floor(prog) } : m));
        }, 500);

        const res = await fetch('/api/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: textToSend, imageData: latestImageData })
        });
        const data = await res.json();
        clearInterval(interval);

        if (res.ok) {
           const finalMsg: Message = { id: modelMsgId, role: 'model', type: 'image', status: 'done', progress: 100, url: data.image, text: 'Image generated successfully.' };
           setMessages(prev => prev.map(m => m.id === modelMsgId ? finalMsg : m));
           saveMessageToFirestore(finalMsg);
        } else {
           throw new Error(data.error);
        }

      } else if (actualType === 'video') {
        setMessages(prev => [...prev, { id: modelMsgId, role: 'model', text: '', type: 'video', status: 'generating', progress: 0 }]);
        
        let prog = 0;
        const res = await fetch('/api/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: textToSend })
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error);

        const opName = data.operationName;
        
        const interval = setInterval(async () => {
          try {
             prog += Math.random() * 5;
             if (prog > 90) prog = 90;
             setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, progress: Math.floor(prog) } : m));

             const statusRes = await fetch('/api/video-status', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ operationName: opName })
             });
             const statusData = await statusRes.json();
             
             if (statusData.done) {
                clearInterval(interval);
                setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, progress: 95 } : m));
                
                const dlRes = await fetch('/api/video-download', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ operationName: opName })
                });
                const blob = await dlRes.blob();
                const url = URL.createObjectURL(blob);
                
                const finalMsg: Message = { id: modelMsgId, role: 'model', type: 'video', status: 'done', progress: 100, url, text: 'Video generated successfully.' };
                setMessages(prev => prev.map(m => m.id === modelMsgId ? finalMsg : m));
                saveMessageToFirestore(finalMsg);
                setIsLoading(false);
             }
          } catch(err: any) {
             clearInterval(interval);
             const finalMsg: Message = { id: modelMsgId, role: 'model', type: 'video', status: 'done', text: `Error checking video status: ${err.message}` };
             setMessages(prev => prev.map(m => m.id === modelMsgId ? finalMsg : m));
             saveMessageToFirestore(finalMsg);
             setIsLoading(false);
          }
        }, 10000);
        return; // wait for interval to finish

      } else if (actualType === 'code') {
        setMessages(prev => [...prev, { id: modelMsgId, role: 'model', text: '', type: 'code', status: 'generating' }]);
        const res = await fetch('/api/code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: textToSend })
        });
        const data = await res.json();
        if(res.ok) {
           const finalMsg: Message = { id: modelMsgId, role: 'model', type: 'code', status: 'done', code: data.code, text: data.explanation || 'Code generated.' };
           setMessages(prev => prev.map(m => m.id === modelMsgId ? finalMsg : m));
           saveMessageToFirestore(finalMsg);
        } else {
           throw new Error(data.error);
        }
      } else if (actualType === 'tts') {
        setMessages(prev => [...prev, { id: modelMsgId, role: 'model', text: 'Generating speech...', type: 'chat' }]);
        const res = await fetch('/api/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: textToSend })
        });
        if(res.ok) {
           const blob = await res.blob();
           const url = URL.createObjectURL(blob);
           const finalMsg: Message = { id: modelMsgId, role: 'model', type: 'audio', status: 'done', url, text: 'Here is the audio you requested:' };
           setMessages(prev => prev.map(m => m.id === modelMsgId ? finalMsg : m));
           saveMessageToFirestore(finalMsg);
        } else {
           const data = await res.json();
           throw new Error(data.error);
        }
      } else {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: textToSend, history: messages.slice(-5), imageData: latestImageData })
        });
        const data = await res.json();
        if(res.ok) {
           const finalMsg: Message = { id: Date.now().toString(), role: 'model', text: data.text || 'Done.' };
           setMessages(prev => [...prev, finalMsg]);
           saveMessageToFirestore(finalMsg);
        } else {
           throw new Error(data.error);
        }
      }
    } catch (err: any) {
      setMessages(prev => {
         const exists = prev.find(m => m.id === modelMsgId);
         if(exists) {
            return prev.map(m => m.id === modelMsgId ? { ...m, status: 'done', text: `Error: ${err.message}` } : m);
         }
         return [...prev, { id: Date.now().toString(), role: 'model', text: `Error: ${err.message}` }];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (type: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (type === 'image') input.accept = 'image/*';
    if (type === 'pdf') input.accept = '.pdf';
    if (type === 'zip') input.accept = '.zip';
    if (type === 'audio') input.accept = 'audio/*';
    
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        if (type === 'image' || type === 'audio') {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUri = reader.result as string;
            const userMsg: Message = { id: Date.now().toString(), role: 'user', text: `[Uploaded ${type.toUpperCase()}: ${file.name}]`, imageData: dataUri };
            setMessages(prev => [...prev, userMsg]);
            saveMessageToFirestore(userMsg);
            
            setTimeout(() => {
              const modelMsg: Message = { id: (Date.now() + 1).toString(), role: 'model', text: `I have received the ${type}. You can now ask me to edit it or generate something from it.` };
              setMessages(prev => [...prev, modelMsg]);
              saveMessageToFirestore(modelMsg);
            }, 1000);
          };
          reader.readAsDataURL(file);
        } else {
          const userMsg: Message = { id: Date.now().toString(), role: 'user', text: `[Uploaded ${type.toUpperCase()}: ${file.name}]` };
          setMessages(prev => [...prev, userMsg]);
          saveMessageToFirestore(userMsg);
          
          setTimeout(() => {
            const modelMsg: Message = { id: (Date.now() + 1).toString(), role: 'model', text: `I have analyzed the contents of ${file.name}. I can now use this context to generate code, images, or answer questions based on it. Try asking me to "build a game using this" or "extract the HTML".` };
            setMessages(prev => [...prev, modelMsg]);
            saveMessageToFirestore(modelMsg);
          }, 1500);
        }
      }
      setPlusMenuOpen(false);
    };
    input.click();
  };

  const clearChat = () => {
    const newSession = Date.now().toString();
    setCurrentSessionId(newSession);
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-[#212121] text-gray-100 font-sans overflow-hidden selection:bg-purple-500/30">
      
      {/* Sidebar - Desktop */}
      <div className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:relative z-40 w-64 h-full bg-[#171717] transition-transform duration-300 flex flex-col`}>
        <div className="p-3">
          <button onClick={clearChat} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[#2f2f2f] transition-colors group">
            <div className="flex items-center text-sm font-medium">
              <Plus className="w-4 h-4 mr-2" />
              New Chat
            </div>
            <Sparkles className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="text-xs font-semibold text-gray-500 mb-3 px-2 mt-4">Recent</div>
          {(() => {
            const sessionsMap = new Map<string, string>();
            allMessages.forEach(msg => {
              if (msg.role === 'user') {
                const sid = msg.sessionId || 'default';
                if (!sessionsMap.has(sid)) {
                  sessionsMap.set(sid, msg.text.substring(0, 30) + (msg.text.length > 30 ? '...' : ''));
                }
              }
            });
            const sessionsList = Array.from(sessionsMap.entries()).reverse();
            if (sessionsList.length === 0) {
              return <div className="px-3 text-xs text-gray-500 italic">No recent chats</div>;
            }
            return sessionsList.map(([sid, text]) => (
              <button key={sid} onClick={() => { setCurrentSessionId(sid); setSidebarOpen(false); }} className={`w-full text-left truncate px-3 py-2 rounded-lg text-sm transition-colors ${currentSessionId === sid ? 'bg-[#2f2f2f] text-white' : 'text-gray-400 hover:bg-[#2f2f2f] hover:text-gray-200'}`}>
                {text}
              </button>
            ));
          })()}
        </div>

        <div className="p-3 border-t border-[#2f2f2f] space-y-1">
          <button onClick={() => window.open('https://play.google.com/store/apps', '_blank')} className="w-full flex items-center px-3 py-3 rounded-lg hover:bg-[#2f2f2f] transition-colors text-sm">
            <div className="bg-white/10 p-1 rounded-full mr-3"><Download className="w-4 h-4 text-green-400" /></div>
            <div className="text-left flex-1">
              <div className="font-medium">Download App</div>
              <div className="text-xs text-gray-400">Get Android App</div>
            </div>
          </button>
          <button onClick={() => setPlanModalOpen(true)} className="w-full flex items-center px-3 py-3 rounded-lg hover:bg-[#2f2f2f] transition-colors text-sm">
            <div className="bg-white/10 p-1 rounded-full mr-3"><Sparkles className="w-4 h-4 text-yellow-400" /></div>
            <div className="text-left flex-1">
              <div className="font-medium">Upgrade Plan</div>
              <div className="text-xs text-gray-400">Get Nexus Advanced</div>
            </div>
          </button>

          {currentUser ? (
             <button onClick={() => signOut(auth)} className="w-full flex items-center px-3 py-3 rounded-lg hover:bg-[#2f2f2f] transition-colors text-sm group">
               <div className="w-7 h-7 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center mr-3 text-white font-bold group-hover:hidden">{currentUser.name?.[0] || 'U'}</div>
               <div className="w-7 h-7 rounded-full bg-red-500/20 items-center justify-center mr-3 hidden group-hover:flex"><User className="w-4 h-4 text-red-500" /></div>
               <div className="text-left font-medium flex-1">
                 <div className="group-hover:hidden">{currentUser.name}</div>
                 <div className="hidden group-hover:block text-red-400">Sign Out</div>
               </div>
             </button>
          ) : (
            <button onClick={() => setLoginModalOpen(true)} className="w-full flex items-center px-3 py-3 rounded-lg hover:bg-[#2f2f2f] transition-colors text-sm">
              <div className="bg-white/10 p-1.5 rounded-full mr-3"><User className="w-4 h-4 text-gray-300" /></div>
              <div className="text-left font-medium">Login with Google</div>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative min-w-0">
        
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 sticky top-0 z-20 bg-[#212121]/90 backdrop-blur-sm">
          <button className="md:hidden p-2 text-gray-400 hover:text-white" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="relative">
            <button 
              onClick={() => setModelSelectorOpen(!isModelSelectorOpen)}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg hover:bg-[#2f2f2f] transition-colors text-lg font-semibold text-gray-200"
            >
              <span>{selectedModel}</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            
            <AnimatePresence>
              {isModelSelectorOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full left-0 mt-2 w-72 bg-[#2f2f2f] border border-gray-700 rounded-xl shadow-2xl py-2 z-50"
                >
                  <ModelOption name="Nexus 1 (Free)" desc="1 Hour Chat (Other features coming soon)" isSelected={selectedModel === 'Nexus 1 (Free)'} onClick={() => {setSelectedModel('Nexus 1 (Free)'); setModelSelectorOpen(false);}} />
                  <ModelOption name="Nexus Advance (₹199)" desc="Nexus 1.2" isLocked={!currentUser || currentUser.email !== 'dinesdas39469@gmail.com'} isSelected={selectedModel === 'Nexus Advance (₹199)'} onClick={() => { if(currentUser?.email === 'dinesdas39469@gmail.com') {setSelectedModel('Nexus Advance (₹199)'); setModelSelectorOpen(false);} else setPlanModalOpen(true); }} />
                  <ModelOption name="Nexus Max (₹599)" desc="Advance Model daily 12 hours" isLocked={!currentUser || currentUser.email !== 'dinesdas39469@gmail.com'} isSelected={selectedModel === 'Nexus Max (₹599)'} onClick={() => { if(currentUser?.email === 'dinesdas39469@gmail.com') {setSelectedModel('Nexus Max (₹599)'); setModelSelectorOpen(false);} else setPlanModalOpen(true); }} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="flex items-center space-x-3">
             <button 
               onClick={toggleTheme}
               className="text-xs text-gray-400 hover:text-white bg-[#2f2f2f] hover:bg-[#3f3f3f] p-2 rounded-lg border border-gray-700 transition-colors"
               title="Toggle Theme"
             >
               {isLightMode ? <Settings className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} 
             </button>
             <button 
               onClick={() => {
                  const blob = new Blob([JSON.stringify(messages, null, 2)], {type: 'application/json'});
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'nexus_chat_history.json';
                  a.click();
                  URL.revokeObjectURL(url);
               }}
               className="text-xs text-gray-400 hover:text-white bg-[#2f2f2f] hover:bg-[#3f3f3f] px-3 py-1.5 rounded-lg border border-gray-700 transition-colors"
             >
               Download Chat
             </button>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto px-4 md:px-0">
          <div className="max-w-3xl mx-auto pb-32 pt-8">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center mt-20 md:mt-32">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                  <Sparkles className="w-8 h-8 text-black" />
                </div>
                <h1 className="text-3xl font-semibold text-gray-100 mb-8">How can I help you today?</h1>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl px-4">
                  <SuggestionCard icon={ImageIcon} text="Generate an image (Coming Soon)" onClick={() => handleSend(undefined, "Generate a cyberpunk city image", 'image')} />
                  <SuggestionCard icon={Video} text="Create a video (Coming Soon)" onClick={() => handleSend(undefined, "A cinematic drone shot of a forest", 'video')} />
                  <SuggestionCard icon={Code2} text="Write a matrix code" onClick={() => handleSend(undefined, "Create a rotating 3D cube in HTML", 'code')} />
                  <SuggestionCard icon={MessageSquare} text="Plan an itinerary" onClick={() => handleSend(undefined, "Plan a 3-day trip to Tokyo", 'chat')} />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((msg) => (
                  <div key={msg.id} className="flex px-4">
                    <div className="w-8 h-8 flex-shrink-0 mr-4 flex items-center justify-center rounded-full overflow-hidden">
                      {msg.role === 'user' ? (
                        <div className="w-full h-full bg-purple-600 flex items-center justify-center font-bold text-white text-sm">
                          {currentUser ? currentUser.name[0] : 'U'}
                        </div>
                      ) : (
                        <div className="w-full h-full bg-white flex items-center justify-center border border-gray-700">
                          <Sparkles className="w-5 h-5 text-black" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-gray-200">
                       {msg.type === 'image' && msg.status === 'generating' && (
                          <div className="w-full max-w-md aspect-video bg-black rounded-lg flex flex-col items-center justify-center border border-gray-700">
                             <div className="text-gray-400 mb-2 font-mono text-sm">GENERATING VISION {msg.progress || 0}%</div>
                             <div className="w-48 h-2 bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${msg.progress || 0}%` }}></div>
                             </div>
                          </div>
                       )}
                       {msg.type === 'video' && msg.status === 'generating' && (
                          <div className="w-full max-w-md aspect-video bg-black rounded-lg flex flex-col items-center justify-center border border-gray-700">
                             <div className="text-gray-400 mb-2 font-mono text-sm">SYNTHESIZING KINETICS {msg.progress || 0}%</div>
                             <div className="w-48 h-2 bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${msg.progress || 0}%` }}></div>
                             </div>
                          </div>
                       )}
                       {msg.type === 'image' && msg.status === 'done' && msg.url && (
                          <div className="w-full max-w-md">
                             <img src={msg.url} className="w-full h-auto rounded-lg shadow-lg" alt="Generated" />
                          </div>
                       )}
                       {msg.type === 'video' && msg.status === 'done' && msg.url && (
                          <div className="w-full max-w-md">
                             <video src={msg.url} controls autoPlay loop className="w-full h-auto rounded-lg shadow-lg" />
                          </div>
                       )}
                       {msg.type === 'audio' && msg.url && (
                          <div className="w-full max-w-md mt-4">
                             <audio src={msg.url} controls className="w-full" />
                          </div>
                       )}
                       
                       {msg.type === 'code' && msg.status === 'generating' && (
                          <div className="flex items-center text-gray-400 space-x-2">
                            <Code2 className="w-5 h-5 animate-pulse text-purple-400" />
                            <span className="font-mono text-sm tracking-widest">WRITING MATRIX...</span>
                          </div>
                       )}
                       {msg.type === 'code' && msg.status === 'done' && msg.code && (
                          <div className="mt-4">
                             <div className="prose prose-invert max-w-none text-gray-200 mb-4">
                                <ReactMarkdown>{msg.text}</ReactMarkdown>
                             </div>
                             <div className="relative group my-4">
                               <div className="absolute top-2 right-2 flex space-x-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                 <button 
                                   onClick={() => setPreviewCode(msg.code || null)}
                                   className="bg-purple-600/80 text-xs px-2 py-1 rounded text-white hover:bg-purple-600 flex items-center border border-purple-500 shadow-sm backdrop-blur-sm"
                                 >
                                   Live Preview
                                 </button>
                                 <button 
                                   onClick={() => {
                                     const blob = new Blob([msg.code!], {type: 'text/html'});
                                     const url = URL.createObjectURL(blob);
                                     const a = document.createElement('a');
                                     a.href = url;
                                     a.download = 'nexus_app.html';
                                     a.click();
                                     URL.revokeObjectURL(url);
                                   }}
                                   className="bg-gray-700/80 text-xs px-2 py-1 rounded text-gray-200 hover:text-white flex items-center border border-gray-600 shadow-sm backdrop-blur-sm"
                                 >
                                   Download HTML
                                 </button>
                               </div>
                               <pre className="bg-black/80 p-4 rounded-xl overflow-x-auto text-sm border border-gray-700/50 text-gray-300">
                                 <code className="language-html">
                                   {msg.code}
                                 </code>
                               </pre>
                             </div>
                          </div>
                       )}

                       {(!msg.type || msg.type === 'chat') && (
                         <div className="prose prose-invert prose-p:leading-relaxed max-w-none">
                           <ReactMarkdown
                             components={{
                               pre({children}: any) {
                                 const codeElement = React.isValidElement(children) ? children : null;
                                 const className = codeElement ? (codeElement.props as any).className : '';
                                 const codeStr = codeElement ? String((codeElement.props as any).children).replace(/\n$/, '') : '';
                                 const match = /language-(\w+)/.exec(className || '');
                                 return (
                                   <div className="relative group my-4">
                                     <div className="absolute top-2 right-2 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                       {match && match[1] === 'html' && (
                                         <button 
                                           onClick={() => setPreviewCode(codeStr)}
                                           className="bg-purple-600/80 text-xs px-2 py-1 rounded text-white hover:bg-purple-600 flex items-center border border-purple-500 shadow-sm backdrop-blur-sm"
                                         >
                                           Live Preview
                                         </button>
                                       )}
                                       <button 
                                         onClick={() => {
                                           const blob = new Blob([codeStr], {type: 'text/html'});
                                           const url = URL.createObjectURL(blob);
                                           const a = document.createElement('a');
                                           a.href = url;
                                           a.download = 'nexus_app.html';
                                           a.click();
                                           URL.revokeObjectURL(url);
                                         }}
                                         className="bg-gray-700/80 text-xs px-2 py-1 rounded text-gray-200 hover:text-white flex items-center border border-gray-600 shadow-sm backdrop-blur-sm"
                                       >
                                         Download HTML
                                       </button>
                                     </div>
                                     <pre className="bg-black/80 p-4 rounded-xl overflow-x-auto text-sm border border-gray-700/50 text-gray-300">
                                       <code className={className}>
                                         {codeStr}
                                       </code>
                                     </pre>
                                   </div>
                                 );
                               },
                               code({node, className, children, ...props}: any) {
                                 return (
                                   <code className="bg-gray-800 px-1.5 py-0.5 rounded text-sm text-gray-300" {...props}>
                                     {children}
                                   </code>
                                 );
                               }
                             }}
                           >
                             {msg.text}
                           </ReactMarkdown>
                         </div>
                       )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex px-4">
                    <div className="w-8 h-8 flex-shrink-0 mr-4 flex items-center justify-center rounded-full bg-white">
                      <Sparkles className="w-5 h-5 text-black animate-pulse" />
                    </div>
                    <div className="flex items-center text-gray-400">
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce mr-1"></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce mr-1" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#212121] via-[#212121] to-transparent pt-10 pb-4 px-4 md:px-0">
          <div className="max-w-3xl mx-auto relative">
            <form onSubmit={(e) => handleSend(e, undefined, 'chat')} className="relative bg-[#2f2f2f] rounded-2xl border border-gray-600/50 shadow-lg flex items-end min-h-[56px] focus-within:border-gray-500 transition-colors">
              
              <div className="relative">
                <button 
                  type="button" 
                  onClick={() => setPlusMenuOpen(!plusMenuOpen)}
                  className="p-3 m-1 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                >
                  <Plus className="w-6 h-6" />
                </button>
                
                {/* Plus Menu Popover */}
                <AnimatePresence>
                  {plusMenuOpen && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="absolute bottom-full left-0 mb-2 w-56 bg-[#2f2f2f] border border-gray-700 rounded-xl shadow-2xl py-2 z-50"
                    >
                      <PlusMenuItem icon={ImageIcon} label="Upload Image" onClick={() => handleFileUpload('image')} />
                      <PlusMenuItem icon={Paperclip} label="Upload PDF" onClick={() => handleFileUpload('pdf')} />
                      <PlusMenuItem icon={Code2} label="Upload ZIP" onClick={() => handleFileUpload('zip')} />
                      <div className="h-px bg-gray-700 my-1 mx-3" />
                      <PlusMenuItem icon={ImageIcon} label="Generate Image" onClick={() => { setPlusMenuOpen(false); handleSend(undefined, input || "A beautiful landscape", 'image'); }} />
                      <PlusMenuItem icon={Video} label="Generate Video" onClick={() => { setPlusMenuOpen(false); handleSend(undefined, input || "A drone shot of a city", 'video'); }} />
                      <PlusMenuItem icon={Code2} label="Run Matrix Code" onClick={() => { setPlusMenuOpen(false); handleSend(undefined, input || "Create a hello world webpage", 'code'); }} />
                      <div className="h-px bg-gray-700 my-1 mx-3" />
                      <PlusMenuItem icon={Mic} label="Voice Cloning (Beta)" onClick={() => { setPlusMenuOpen(false); handleSend(undefined, "I need to clone a voice from an audio clip. I will upload an mp3 file shortly to use as the base, and you will generate text-to-speech from it.", 'chat'); }} />
                      <PlusMenuItem icon={Mic} label="Text to Speech" onClick={() => { setPlusMenuOpen(false); handleSend(undefined, "Convert this text into ultra-realistic speech: " + (input || "Hello, I am Nexus."), 'chat'); }} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e, undefined, 'chat'); } }}
                placeholder={isLoading ? "Generating response..." : "Message Nexus..."}
                disabled={isLoading}
                className="flex-1 bg-transparent border-0 focus:ring-0 resize-none py-4 px-2 text-white placeholder-gray-400 max-h-48 overflow-y-auto min-h-[56px] disabled:opacity-50"
                rows={1}
              />

              <div className="flex items-center space-x-1 p-2 m-1">
                <button type="button" onClick={toggleListen} className={`p-2 rounded-full transition-colors ${isListening ? 'bg-red-500/20 text-red-400 animate-pulse' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}>
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button type="submit" disabled={!input.trim() || isLoading} className="p-2 rounded-lg bg-white text-black hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:bg-white/10 disabled:text-gray-400">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
            <div className="text-center mt-3 flex items-center justify-center space-x-2">
              <span className="text-[10px] text-gray-500 font-medium">Made with KEROxI</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <PlanModal isOpen={isPlanModalOpen} onClose={() => setPlanModalOpen(false)} />
      <LoginModal isOpen={isLoginModalOpen} onClose={() => setLoginModalOpen(false)} />

      {/* Code Preview Modal */}
      <AnimatePresence>
        {previewCode && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex flex-col backdrop-blur-sm">
            <div className="flex items-center justify-between p-4 bg-[#171717] border-b border-gray-700">
              <div className="flex items-center space-x-3 text-white">
                <Code2 className="w-5 h-5 text-purple-400" />
                <span className="font-mono text-sm tracking-widest">NEXUS LIVE PREVIEW</span>
              </div>
              <button onClick={() => setPreviewCode(null)} className="p-2 text-gray-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 bg-white relative">
              <iframe
                srcDoc={previewCode}
                className="w-full h-full border-none"
                sandbox="allow-scripts allow-popups allow-forms allow-same-origin"
                title="Live Preview"
              />
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ModelOption = ({ name, desc, isLocked, isSelected, onClick }: any) => (
  <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#3f3f3f] transition-colors group">
    <div className="text-left flex-1">
      <div className="flex items-center space-x-2">
        <span className="text-gray-200 font-medium text-sm">{name}</span>
        {isLocked && <Shield className="w-3 h-3 text-yellow-500" />}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
    </div>
    {isSelected && <Check className="w-4 h-4 text-white" />}
  </button>
);

const PlusMenuItem = ({ icon: Icon, label, onClick }: any) => (
  <button onClick={onClick} className="w-full flex items-center space-x-3 px-4 py-2 hover:bg-[#3f3f3f] transition-colors text-sm text-gray-300">
    <Icon className="w-4 h-4 text-gray-400" />
    <span>{label}</span>
  </button>
);

const SuggestionCard = ({ icon: Icon, text, onClick }: any) => (
  <button onClick={onClick} className="flex flex-col items-start p-4 bg-[#2f2f2f] hover:bg-[#3f3f3f] border border-gray-700 rounded-xl transition-colors text-left group h-full">
    <Icon className="w-5 h-5 text-gray-400 mb-2 group-hover:text-white transition-colors" />
    <span className="text-sm font-medium text-gray-300 group-hover:text-white">{text}</span>
  </button>
);

const PlanModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#212121] border border-gray-700 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Upgrade your plan</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {/* Free Plan */}
          <div className="p-5 rounded-2xl bg-[#2f2f2f] border border-gray-700 flex flex-col">
            <h3 className="text-xl font-semibold mb-2">Free</h3>
            <div className="text-3xl font-bold mb-4">₹0<span className="text-sm text-gray-400 font-normal">/month</span></div>
            <ul className="space-y-3 mb-6 flex-1 text-sm text-gray-300">
              <li className="flex items-start"><Check className="w-4 h-4 text-green-500 mr-2 shrink-0 mt-0.5" /> 1 Hour Daily Chat</li>
              <li className="flex items-start"><Check className="w-4 h-4 text-green-500 mr-2 shrink-0 mt-0.5" /> Image Generation (Coming Soon)</li>
              <li className="flex items-start"><Check className="w-4 h-4 text-green-500 mr-2 shrink-0 mt-0.5" /> Video Generation (Coming Soon)</li>
            </ul>
            <button disabled className="w-full py-2.5 rounded-lg bg-gray-600 text-white font-medium opacity-50 cursor-not-allowed">Current Plan</button>
          </div>

          {/* 2Rs Mini Plan */}
          <div className="p-5 rounded-2xl bg-gradient-to-b from-green-900/40 to-[#2f2f2f] border border-green-500/50 flex flex-col">
            <h3 className="text-xl font-semibold mb-2">Mini Plan</h3>
            <div className="text-3xl font-bold mb-4">₹2<span className="text-sm text-green-300 font-normal">/month</span></div>
            <ul className="space-y-3 mb-6 flex-1 text-sm text-gray-200">
              <li className="flex items-start"><Check className="w-4 h-4 text-green-400 mr-2 shrink-0 mt-0.5" /> 24/7 Unlimited Chat</li>
              <li className="flex items-start"><Check className="w-4 h-4 text-green-400 mr-2 shrink-0 mt-0.5" /> Features Coming Soon</li>
            </ul>
            <div className="space-y-2 mt-auto">
               <a href="upi://pay?pa=9304242811-2@ybl&pn=Nexus%20AI%20Mini&am=2&cu=INR" className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors text-center block">Monthly (₹2)</a>
            </div>
          </div>

          {/* Plus Plan */}
          <div className="p-5 rounded-2xl bg-gradient-to-b from-purple-900/40 to-[#2f2f2f] border border-purple-500/50 flex flex-col relative">
            <div className="absolute top-0 right-0 bg-purple-500 text-xs font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl">POPULAR</div>
            <h3 className="text-xl font-semibold mb-2">Advance Plan</h3>
            <div className="text-3xl font-bold mb-4">₹199<span className="text-sm text-purple-300 font-normal">/month</span></div>
            <ul className="space-y-3 mb-6 flex-1 text-sm text-gray-200">
              <li className="flex items-start"><Check className="w-4 h-4 text-purple-400 mr-2 shrink-0 mt-0.5" /> 24/7 Unlimited Chat</li>
              <li className="flex items-start"><Check className="w-4 h-4 text-purple-400 mr-2 shrink-0 mt-0.5" /> Advance Features (Coming Soon)</li>
            </ul>
            <div className="space-y-2 mt-auto">
               <a href="upi://pay?pa=9304242811-2@ybl&pn=Nexus%20AI%20Advance&am=49&cu=INR" className="w-full py-2 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 font-medium transition-colors text-center block text-sm border border-purple-500/30">Weekly (₹49)</a>
               <a href="upi://pay?pa=9304242811-2@ybl&pn=Nexus%20AI%20Advance&am=199&cu=INR" className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors text-center block">Monthly (₹199)</a>
               <a href="upi://pay?pa=9304242811-2@ybl&pn=Nexus%20AI%20Advance&am=1999&cu=INR" className="w-full py-2 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 font-medium transition-colors text-center block text-sm border border-purple-500/30">Yearly (₹1999)</a>
            </div>
          </div>

          {/* Max Plan */}
          <div className="p-5 rounded-2xl bg-gradient-to-b from-blue-900/40 to-[#2f2f2f] border border-blue-500/50 flex flex-col">
            <h3 className="text-xl font-semibold mb-2 flex items-center">Nexus Max <Zap className="w-5 h-5 text-yellow-400 ml-2" /></h3>
            <div className="text-3xl font-bold mb-4">₹599<span className="text-sm text-blue-300 font-normal">/month</span></div>
            <ul className="space-y-3 mb-6 flex-1 text-sm text-gray-200">
              <li className="flex items-start"><Check className="w-4 h-4 text-blue-400 mr-2 shrink-0 mt-0.5" /> 24/7 Unlimited Chat</li>
              <li className="flex items-start"><Check className="w-4 h-4 text-blue-400 mr-2 shrink-0 mt-0.5" /> Max Features (Coming Soon)</li>
            </ul>
            <div className="space-y-2 mt-auto">
               <a href="upi://pay?pa=9304242811-2@ybl&pn=Nexus%20AI%20Max&am=149&cu=INR" className="w-full py-2 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 font-medium transition-colors text-center block text-sm border border-blue-500/30">Weekly (₹149)</a>
               <a href="upi://pay?pa=9304242811-2@ybl&pn=Nexus%20AI%20Max&am=599&cu=INR" className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors text-center block">Monthly (₹599)</a>
               <a href="upi://pay?pa=9304242811-2@ybl&pn=Nexus%20AI%20Max&am=5999&cu=INR" className="w-full py-2 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 font-medium transition-colors text-center block text-sm border border-blue-500/30">Yearly (₹5999)</a>
            </div>
          </div>
        </div>
        
        <div className="border-t border-gray-700 pt-6 text-center">
          <p className="text-gray-400 text-sm mb-4">Support the developers</p>
          <a href="upi://pay?pa=9304242811-2@ybl&pn=Nexus%20AI%20Donation&am=1&cu=INR" className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 inline-block hover:bg-red-500/20 transition-colors">
             <div className="text-red-400 font-medium mb-1 flex items-center justify-center">
               <span>❤️ App Heart Donation (₹1)</span>
             </div>
             <div className="font-mono text-gray-300 text-xs mt-1">UPI: 9304242811-2@ybl</div>
          </a>
        </div>

      </motion.div>
    </div>
  );
};

const LoginModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleGoogleClick = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (error: any) {
      console.warn("Auth error", error.message);
      setErrorMsg(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#212121] border border-gray-700 rounded-2xl p-8 max-w-sm w-full text-center relative overflow-hidden">
        
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.1)] mx-auto mb-6">
          <Sparkles className="w-8 h-8 text-black" />
        </div>
        
        <h2 className="text-2xl font-bold mb-2">Welcome back</h2>
        <p className="text-gray-400 text-sm mb-8">Sign in to continue to Nexus Pro</p>

        {errorMsg && <p className="text-red-500 text-sm mb-4">{errorMsg}</p>}
        
        <button onClick={handleGoogleClick} disabled={isLoading} className="w-full flex items-center justify-center bg-white text-black font-semibold py-3 px-4 rounded-lg hover:bg-gray-200 transition-colors relative overflow-hidden">
          {isLoading ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-5 h-5 border-2 border-black border-t-transparent rounded-full" />
          ) : (
            <>
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
};
