
import React, { useState, useEffect, useCallback, useRef } from 'react';
import BlocklyComponent from './components/BlocklyComponent';
import Stage from './components/Stage';
import { LEVELS, DEMO_LEVEL } from './constants';
import { GameState, Direction, Command, Position, CommandType } from './types';
import { 
  Play, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  Volume2, 
  Home,
  Bot,
  Music,
  Music4,
  SkipForward,
  Code,
  Puzzle,
  Award,
  BookOpen,
  CheckCircle2,
  Terminal
} from 'lucide-react';

const App: React.FC = () => {
  // Navigation State
  const [showLanding, setShowLanding] = useState(true);
  const [showCertificate, setShowCertificate] = useState(false);
  
  // Tutorial State
  const [isTutorialMode, setIsTutorialMode] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0); // 0=Intro, 1=Left, 2=Center, 3=Controls, 4=Result, 5=Guide
  const [showBlockGuide, setShowBlockGuide] = useState(false);

  // Game State
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const [code, setCode] = useState("");
  const [blockCount, setBlockCount] = useState(0);
  const [gameState, setGameState] = useState<GameState>({
    characterPos: { x: 0, y: 0 },
    characterDir: Direction.EAST,
    isCompleted: false,
    message: null,
    isRunning: false,
    visited: [],
    hasFuel: false,
    fuelCollected: false
  });
  const [completedLevels, setCompletedLevels] = useState<number[]>([]);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);

  // Stepping State
  const [stepIndex, setStepIndex] = useState(0);

  // Determine active level (Demo or Actual)
  const activeLevel = isTutorialMode ? DEMO_LEVEL : LEVELS[currentLevelIndex];

  const commandQueueRef = useRef<Command[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasErrorRef = useRef<boolean>(false); // Track if a collision occurred
  
  // Audio Refs
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const walkSfxRef = useRef<HTMLAudioElement | null>(null);
  const turnSfxRef = useRef<HTMLAudioElement | null>(null);
  const collectSfxRef = useRef<HTMLAudioElement | null>(null);
  const winSfxRef = useRef<HTMLAudioElement | null>(null);
  const failSfxRef = useRef<HTMLAudioElement | null>(null);

  // Initialize Audio
  useEffect(() => {
    // Background Music: SoundHelix Song 15 (Calm/Easy Listening)
    bgmRef.current = new Audio("https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3"); 
    bgmRef.current.loop = true;
    bgmRef.current.volume = 0.05; // Keep low
    bgmRef.current.preload = 'auto';

    // SFX: Robot Move - "Mechanism Latch" (Loud & Clear Mechanical Sound)
    walkSfxRef.current = new Audio("https://actions.google.com/sounds/v1/mechanisms/mechanism_latch.ogg");
    walkSfxRef.current.volume = 1.0; 
    walkSfxRef.current.preload = 'auto';

    // SFX: Robot Turn - "Keyboard Type" (Short Click)
    turnSfxRef.current = new Audio("https://actions.google.com/sounds/v1/foley/keyboard_type_single.ogg");
    turnSfxRef.current.volume = 0.8;
    turnSfxRef.current.preload = 'auto';

    // SFX: Collect Fuel - "Pop"
    collectSfxRef.current = new Audio("https://actions.google.com/sounds/v1/cartoon/pop.ogg");
    collectSfxRef.current.volume = 1.0;
    collectSfxRef.current.preload = 'auto';

    // SFX: Win - "Magic Chime" (Distinct Ping Pong/Magical Sound)
    winSfxRef.current = new Audio("https://actions.google.com/sounds/v1/cartoon/magic_chime.ogg");
    winSfxRef.current.volume = 1.0;
    winSfxRef.current.preload = 'auto';

    // SFX: Fail - "Clang and Wobble"
    failSfxRef.current = new Audio("https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg");
    failSfxRef.current.volume = 1.0; 
    failSfxRef.current.preload = 'auto';
    
    return () => {
        if (bgmRef.current) {
            bgmRef.current.pause();
            bgmRef.current = null;
        }
    };
  }, []);

  const playSfx = (type: 'walk' | 'turn' | 'collect' | 'win' | 'fail') => {
      let audio: HTMLAudioElement | null = null;
      
      switch(type) {
          case 'walk': audio = walkSfxRef.current; break;
          case 'turn': audio = turnSfxRef.current; break;
          case 'collect': audio = collectSfxRef.current; break;
          case 'win': audio = winSfxRef.current; break;
          case 'fail': audio = failSfxRef.current; break;
      }

      if (audio) {
          audio.pause();
          audio.currentTime = 0; 
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(e => {
                // Auto-play was prevented
                console.warn("Sound play failed", e);
            });
          }
      }
  };

  // --- Voice Logic (Natural Sound) ---
  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      
      // Wait for voices to load (sometimes they are empty on first load)
      let voices = window.speechSynthesis.getVoices();
      
      const selectVoice = () => {
          // Priority 1: Google Thai
          let voice = voices.find(v => v.name.includes('Google') && v.lang.includes('th'));
          
          // Priority 2: Microsoft/Premium Thai (No Desktop)
          if (!voice) {
              voice = voices.find(v => v.lang.includes('th') && !v.name.includes('Desktop') && (v.name.includes('Premium') || v.name.includes('Microsoft')));
          }
          
          // Priority 3: Any Thai
          if (!voice) {
              voice = voices.find(v => v.lang.includes('th'));
          }

          if (voice) {
              utterance.voice = voice;
          }

          utterance.lang = 'th-TH';
          // 1.0 is standard speed.
          utterance.rate = 1.0; 
          utterance.pitch = 1.0; 
          utterance.volume = 1.0; 
          
          window.speechSynthesis.speak(utterance);
      }

      if (voices.length === 0) {
          window.speechSynthesis.onvoiceschanged = () => {
              voices = window.speechSynthesis.getVoices();
              selectVoice();
          };
      } else {
          selectVoice();
      }
    }
  };

  const handleStart = () => {
    setShowLanding(false);
    // Attempt to play music
    if (bgmRef.current) {
        bgmRef.current.play().then(() => {
            setIsMusicPlaying(true);
        }).catch((e) => {
            console.log("Audio autoplay blocked", e);
            setIsMusicPlaying(false);
        });
    }

    // Force unlock other audio elements by playing/pausing quickly (iOS/Safari fix)
    [walkSfxRef.current, turnSfxRef.current, collectSfxRef.current, winSfxRef.current, failSfxRef.current].forEach(audio => {
        if (audio) {
            audio.volume = 0; // Mute for pre-load
            audio.play().then(() => {
                audio.pause();
                audio.currentTime = 0;
                audio.volume = 1.0; // Restore volume
            }).catch(() => {});
        }
    });

    // Start Tutorial Sequence
    startTutorial();
  };

  const startTutorial = () => {
      setIsTutorialMode(true);
      setTutorialStep(0); // Intro Step
      speak("ยินดีต้อนรับสู่ โค้ด คราฟ ครับ... วันนี้เราจะมาฝึกเขียนโปรแกรม ด้วยการต่อบล็อกคำสั่งกันครับ");
  };

  const nextTutorialStep = () => {
      const next = tutorialStep + 1;
      setTutorialStep(next);

      if (next === 1) {
          speak("ทางซ้ายมือ คือโจทย์ของเราครับ... ดูคำใบ้ได้ตรงนี้เลย");
      } else if (next === 2) {
          speak("ตรงกลาง คือพื้นที่เขียนโค้ด... ลากบล็อกมาวางต่อกันตรงนี้ได้เลยครับ");
      } else if (next === 3) {
          speak("ด้านล่าง คือปุ่มควบคุม... กดปุ่มเล่น เพื่อเริ่มทำงาน หรือกดปุ่มเริ่มใหม่ เพื่อแก้ไขครับ");
      } else if (next === 4) {
          speak("ทางขวามือ คือผลลัพธ์... หุ่นยนต์จะเดินตามคำสั่ง ที่เราเขียนไว้ครับ");
      } else if (next === 5) {
          // Show Block Guide
          setShowBlockGuide(true);
          speak("นี่คือคู่มือบล็อกคำสั่ง... ลองจำความหมายของแต่ละบล็อกดูนะครับ");
      }
  };

  const finishTutorial = () => {
      setShowBlockGuide(false);
      setIsTutorialMode(false); // Switch to Real Levels
      setCurrentLevelIndex(0); // Start at Level 1
      speak("พร้อมแล้ว... ลุยกันเลยครับ! " + LEVELS[0].title + ". " + LEVELS[0].description);
  };

  const toggleMusic = () => {
    if (bgmRef.current) {
        if (isMusicPlaying) {
            bgmRef.current.pause();
        } else {
            bgmRef.current.play().catch(() => {});
        }
        setIsMusicPlaying(!isMusicPlaying);
    }
  };

  // Auto-speak Level on enter
  useEffect(() => {
    // Only speak level info if NOT in landing, tutorial mode, or modal
    if (!showLanding && !isTutorialMode && !showBlockGuide && !showCertificate) {
       const timer = setTimeout(() => {
           speak(activeLevel.title + ". " + activeLevel.description);
       }, 800);
       return () => clearTimeout(timer);
    }
  }, [showLanding, isTutorialMode, showBlockGuide, showCertificate, currentLevelIndex, activeLevel]);

  // Initialize Level State
  useEffect(() => {
    resetLevel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLevelIndex, isTutorialMode]); // Reset when tutorial mode changes too

  const resetLevel = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    hasErrorRef.current = false;

    setGameState({
      characterPos: { ...activeLevel.startPos },
      characterDir: activeLevel.startDir,
      isCompleted: false,
      message: null,
      isRunning: false,
      visited: [],
      hasFuel: !!activeLevel.fuelPos,
      fuelCollected: false
    });
    setStepIndex(0);
    commandQueueRef.current = [];
  };

  const parseCode = (generatedCode: string): Command[] => {
    const commands: Command[] = [];
    const cmd = (type: CommandType, payload?: string) => {
      commands.push({ type, payload });
    };
    try {
      // eslint-disable-next-line no-new-func
      const runner = new Function('cmd', generatedCode);
      runner(cmd);
    } catch (e) {
      console.error("Code parsing error", e);
    }
    return commands;
  };

  const prepareExecution = () => {
    const commands = parseCode(code);
    if (commands.length === 0) {
        const msg = "ยังไม่ได้วางคำสั่งเลยครับ ลองลากบล็อกมาวางดูนะ";
        setGameState(prev => ({ ...prev, message: msg }));
        speak(msg);
        return false;
    }
    commandQueueRef.current = commands;
    setStepIndex(0);
    hasErrorRef.current = false;
    return true;
  };

  const handleRun = async () => {
    if (gameState.isRunning) return;
    
    resetLevel();
    if (!prepareExecution()) return;

    setGameState(prev => ({ ...prev, isRunning: true, message: null }));
    executeQueue();
  };

  const handleStep = async () => {
    if (!gameState.isRunning && commandQueueRef.current.length === 0) {
        resetLevel();
        if (!prepareExecution()) return;
        setGameState(prev => ({ ...prev, isRunning: true, message: null }));
        setTimeout(() => executeNextStep(), 100);
    } else {
        executeNextStep();
    }
  };

  const executeNextStep = () => {
      const queue = commandQueueRef.current;
      const index = stepIndex;

      if (index >= queue.length) {
          checkWinCondition(gameState.characterPos, gameState.fuelCollected);
          return;
      }

      const cmd = queue[index];
      
      // Play Sound Effect based on command
      if (cmd.type === 'MOVE') playSfx('walk');
      else if (cmd.type === 'TURN_LEFT' || cmd.type === 'TURN_RIGHT') playSfx('turn');
      else if (cmd.type === 'COLLECT') playSfx('collect');

      setGameState(prev => {
        let newPos = { ...prev.characterPos };
        let newDir = prev.characterDir;
        let msg = null;
        let newFuelCollected = prev.fuelCollected;
        const newVisited = [...prev.visited];

        if (!newVisited.some(v => v.x === newPos.x && v.y === newPos.y)) {
            newVisited.push(newPos);
        }

        if (cmd.type === 'MOVE') {
           const moveVector = getDirVector(newDir);
           const nextX = newPos.x + moveVector.x;
           const nextY = newPos.y + moveVector.y;

           const isBlocked = 
              nextX < 0 || nextX >= activeLevel.gridSize ||
              nextY < 0 || nextY >= activeLevel.gridSize ||
              activeLevel.obstacles.some(o => o.x === nextX && o.y === nextY);

           if (!isBlocked) {
              newPos = { x: nextX, y: nextY };
           } else {
              msg = "อุ๊ย! ชนกำแพง";
              hasErrorRef.current = true;
           }
        } else if (cmd.type === 'TURN_LEFT') {
            newDir = (newDir + 3) % 4;
        } else if (cmd.type === 'TURN_RIGHT') {
            newDir = (newDir + 1) % 4;
        } else if (cmd.type === 'COLLECT') {
            if (activeLevel.fuelPos && newPos.x === activeLevel.fuelPos.x && newPos.y === activeLevel.fuelPos.y) {
                newFuelCollected = true;
                msg = "เติมน้ำมันเรียบร้อย! ⛽";
            } else {
                msg = "ไม่มีอะไรให้เติมตรงนี้นะ";
            }
        }

        if (msg === "อุ๊ย! ชนกำแพง") {
            playSfx('fail');
            speak("ชนกำแพงแล้วครับ ลองใหม่นะ");
        }

        return {
            ...prev,
            characterPos: newPos,
            characterDir: newDir,
            fuelCollected: newFuelCollected,
            message: msg,
            visited: newVisited
        };
      });

      setStepIndex(index + 1);
  };

  const executeQueue = async () => {
      const queue = commandQueueRef.current;
      let currentPos = { ...activeLevel.startPos };
      let currentDir = activeLevel.startDir;
      let currentFuelCollected = false;

      for (let i = 0; i < queue.length; i++) {
        const cmd = queue[i];
        
        await new Promise<void>((resolve) => {
          const id = setTimeout(() => {
            // Play Sound Effect inside the loop
            if (cmd.type === 'MOVE') playSfx('walk');
            else if (cmd.type === 'TURN_LEFT' || cmd.type === 'TURN_RIGHT') playSfx('turn');
            else if (cmd.type === 'COLLECT') playSfx('collect');

            setGameState(prev => {
                let newPos = { ...prev.characterPos };
                let newDir = prev.characterDir;
                let msg = null;
                let newFuelCollected = prev.fuelCollected;
                
                newFuelCollected = currentFuelCollected; 
                newPos = currentPos;
                newDir = currentDir;
                const newVisited = [...prev.visited];

                if (!newVisited.some(v => v.x === newPos.x && v.y === newPos.y)) {
                    newVisited.push(newPos);
                }

                if (cmd.type === 'MOVE') {
                   const moveVector = getDirVector(newDir);
                   const nextX = newPos.x + moveVector.x;
                   const nextY = newPos.y + moveVector.y;

                   const isBlocked = 
                      nextX < 0 || nextX >= activeLevel.gridSize ||
                      nextY < 0 || nextY >= activeLevel.gridSize ||
                      activeLevel.obstacles.some(o => o.x === nextX && o.y === nextY);

                   if (!isBlocked) {
                      newPos = { x: nextX, y: nextY };
                   } else {
                      msg = "อุ๊ย! ชนกำแพง";
                      hasErrorRef.current = true;
                   }
                } else if (cmd.type === 'TURN_LEFT') {
                    newDir = (newDir + 3) % 4;
                } else if (cmd.type === 'TURN_RIGHT') {
                    newDir = (newDir + 1) % 4;
                } else if (cmd.type === 'COLLECT') {
                    if (activeLevel.fuelPos && newPos.x === activeLevel.fuelPos.x && newPos.y === activeLevel.fuelPos.y) {
                        newFuelCollected = true;
                        msg = "เติมน้ำมันเรียบร้อย! ⛽";
                    } else {
                        msg = "ไม่มีอะไรให้เติมตรงนี้นะ";
                    }
                }

                currentPos = newPos;
                currentDir = newDir;
                currentFuelCollected = newFuelCollected;

                // Check for immediate failure (wall collision)
                if (msg === "อุ๊ย! ชนกำแพง") {
                    playSfx('fail');
                    speak("ชนกำแพงแล้วครับ ลองใหม่นะ");
                }

                return {
                    ...prev,
                    characterPos: newPos,
                    characterDir: newDir,
                    fuelCollected: newFuelCollected,
                    message: msg,
                    visited: newVisited
                };
            });
            setStepIndex(i + 1);
            resolve();
          }, 800);
          timeoutsRef.current.push(id);
        });

        // Break loop if error occurred
        if (hasErrorRef.current) break;
      }

      const checkId = setTimeout(() => {
          checkWinCondition(currentPos, currentFuelCollected, true);
      }, 500);
      timeoutsRef.current.push(checkId);
  };

  const getDirVector = (dir: Direction): Position => {
    switch (dir) {
        case Direction.NORTH: return { x: 0, y: -1 };
        case Direction.EAST: return { x: 1, y: 0 };
        case Direction.SOUTH: return { x: 0, y: 1 };
        case Direction.WEST: return { x: -1, y: 0 };
    }
  };

  const checkWinCondition = (finalPos: Position, hasCollectedFuel: boolean, isEndOfQueue: boolean = false) => {
     const isAtGoal = finalPos.x === activeLevel.goalPos.x && finalPos.y === activeLevel.goalPos.y;
     const needsFuel = !!activeLevel.fuelPos;

     if (isAtGoal) {
         if (needsFuel && !hasCollectedFuel) {
             setGameState(prev => ({ ...prev, isRunning: false, message: "ถึงดาวแล้ว แต่ลืมเติมน้ำมันครับ! ⛽" }));
             speak("ถึงดาวแล้ว แต่ลืมเติมน้ำมันนะครับ");
             playSfx('fail');
         } else {
             setGameState(prev => ({ ...prev, isCompleted: true, isRunning: false, message: "เย้! เก่งมากๆ เลยครับ" }));
             speak("เก่งมากๆ เลยครับ ผ่านด่านแล้ว");
             playSfx('win');
             
             if (!isTutorialMode) {
                if (!completedLevels.includes(activeLevel.id)) {
                    setCompletedLevels(prev => [...prev, activeLevel.id]);
                }
                if (activeLevel.id === LEVELS.length) {
                    setTimeout(() => {
                        setShowCertificate(true);
                        speak("ยินดีด้วยครับ คุณได้เรียนจบหลักสูตร Block Coding เบื้องต้นแล้ว เก่งที่สุดเลย!");
                        playSfx('win');
                    }, 1500);
                }
             }
         }
     } else {
         // Did not reach goal
         // If we are at the end of the queue (or manual stepping reached end) AND we didn't crash
         if ((isEndOfQueue || stepIndex >= commandQueueRef.current.length) && !hasErrorRef.current) {
            setGameState(prev => ({ ...prev, isRunning: false, message: "ยังไปไม่ถึงจุดหมาย" }));
            speak("ยังไปไม่ถึงจุดหมาย");
            playSfx('fail');
         } else if (hasErrorRef.current) {
             // Already handled wall collision, just stop running
             setGameState(prev => ({ ...prev, isRunning: false }));
         }
     }
  };

  // --- TUTORIAL OVERLAY ---
  const TutorialOverlay = () => {
      // Only show if in tutorial mode and not yet showing the block guide
      if (!isTutorialMode || showBlockGuide) return null;

      const steps = [
          { text: "Block Coding คือการเขียนโปรแกรมโดยนำบล็อกคำสั่งมาต่อกัน เหมือนตัวต่อเลโก้ เพื่อสั่งให้คอมพิวเตอร์ทำงานตามที่เราต้องการครับ" }, // Step 0: Intro
          { text: "นี่คือส่วน 'โจทย์และคำสั่ง' ดูหมายเลขบทเรียนและอ่านคำใบ้ได้ตรงนี้นะครับ", position: "left-4 md:left-10 top-1/2" }, // Step 1: Left
          { text: "นี่คือ 'พื้นที่เขียนโค้ด' ลากบล็อกมาวางต่อกันตรงนี้ได้เลย", position: "top-1/3 left-1/2 -translate-x-1/2" }, // Step 2: Center
          { text: "นี่คือ 'ปุ่มควบคุม' กดปุ่มสีเขียวเพื่อเริ่มรันโปรแกรม หรือกดปุ่มเริ่มใหม่เพื่อแก้ไขโค้ดครับ", position: "bottom-24 left-1/2 -translate-x-1/2" }, // Step 3: Controls
          { text: "นี่คือ 'ผลลัพธ์' หุ่นยนต์จะเดินตามคำสั่งที่เราเขียนไว้ที่นี่ครับ", position: "right-4 md:right-10 top-1/2" } // Step 4: Result
      ];

      const currentStepData = steps[tutorialStep];

      return (
          <div className="fixed inset-0 z-[60] bg-black/70 flex flex-col animate-in fade-in duration-300">
             {/* Center Text Box for Intro or Positioned for others */}
             <div className={`
                absolute bg-white p-6 rounded-3xl shadow-2xl border-4 border-yellow-400 max-w-xl w-[90%] z-[70] text-center
                ${currentStepData.position || 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'}
             `}>
                 <h3 className="text-2xl font-black text-indigo-800 mb-2">
                     แนะนำการใช้งาน ({tutorialStep + 1}/{steps.length})
                 </h3>
                 <p className="text-xl text-gray-700 font-bold mb-6 leading-relaxed">
                     {currentStepData.text}
                 </p>
                 <button 
                    onClick={nextTutorialStep}
                    className="px-8 py-3 bg-green-500 hover:bg-green-400 text-white rounded-full text-xl font-bold shadow-lg transition-transform hover:scale-105 flex items-center gap-2 mx-auto ring-4 ring-green-200"
                 >
                     <CheckCircle2 /> {tutorialStep === 0 ? 'เริ่มกันเลย' : 'เข้าใจแล้ว'}
                 </button>
             </div>
          </div>
      );
  };

  // --- BLOCK GUIDE MODAL ---
  const BlockGuideModal = () => {
      if (!showBlockGuide) return null;

      const guides = [
          { icon: "🚩", label: "เริ่มต้น", desc: "จุดเริ่มของโปรแกรม" },
          { icon: "➡️", label: "เดินหน้า", desc: "เดินไปข้างหน้า 1 ช่อง" },
          { icon: "↩️", label: "เลี้ยวซ้าย", desc: "หมุนตัวไปทางซ้าย" },
          { icon: "↪️", label: "เลี้ยวขวา", desc: "หมุนตัวไปทางขวา" },
          { icon: "🔄", label: "ทำซ้ำ", desc: "ทำคำสั่งข้างในหลายรอบ" },
          { icon: "⛽", label: "เติมน้ำมัน", desc: "เติมน้ำมัน (เฉพาะด่านที่มีถัง)" },
      ];

      return (
          <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
              <div className="bg-white rounded-3xl p-8 max-w-4xl w-full border-4 border-indigo-500 shadow-2xl relative">
                  <h2 className="text-3xl font-black text-center text-indigo-800 mb-6 flex items-center justify-center gap-3">
                      <BookOpen className="w-10 h-10" /> คู่มือบล็อกคำสั่ง
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                      {guides.map((g, i) => (
                          <div key={i} className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                              <div className="text-4xl">{g.icon}</div>
                              <div>
                                  <div className="font-black text-lg text-indigo-700">{g.label}</div>
                                  <div className="text-gray-500 text-sm">{g.desc}</div>
                              </div>
                          </div>
                      ))}
                  </div>

                  <div className="text-center">
                      <button 
                        onClick={finishTutorial}
                        className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-2xl font-bold shadow-xl transition-all hover:scale-105 ring-4 ring-indigo-300"
                      >
                          เข้าสู่บทเรียน 🚀
                      </button>
                  </div>
              </div>
          </div>
      );
  };

  // --- LANDING PAGE ---
  if (showLanding) {
      return (
          <div className="h-screen w-full bg-code-pattern flex flex-col items-center justify-center p-4 relative overflow-hidden text-white">
              {/* Overlay for better readability */}
              <div className="absolute inset-0 bg-code-overlay pointer-events-none"></div>

              <div className="relative z-10 flex flex-col items-center max-w-2xl w-full text-center animate-in zoom-in duration-500">
                  <div className="bg-slate-900/80 backdrop-blur-md p-8 rounded-3xl mb-12 shadow-[0_0_50px_rgba(34,211,238,0.5)] border-2 border-cyan-500 animate-bounce group relative">
                      <div className="absolute -inset-4 bg-cyan-500/20 rounded-full blur-xl animate-pulse"></div>
                      <svg width="150" height="150" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative z-10 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]">
                        {/* Antenna */}
                        <path d="M100 20V50" stroke="#22D3EE" strokeWidth="8" strokeLinecap="round"/>
                        <circle cx="100" cy="20" r="12" fill="#EF4444" className="animate-ping"/>
                        <circle cx="100" cy="20" r="12" fill="#EF4444"/>
                        
                        {/* Head */}
                        <rect x="40" y="50" width="120" height="110" rx="35" fill="#0F172A" stroke="#22D3EE" strokeWidth="6"/>
                        
                        {/* Face Plate */}
                        <rect x="55" y="85" width="90" height="45" rx="15" fill="#1E293B" stroke="#0EA5E9" strokeWidth="2"/>
                        
                        {/* Eyes */}
                        <circle cx="75" cy="108" r="12" fill="#22D3EE" className="animate-pulse"/>
                        <circle cx="125" cy="108" r="12" fill="#22D3EE" className="animate-pulse"/>
                        
                        {/* Headphones/Ears */}
                        <rect x="20" y="80" width="20" height="50" rx="8" fill="#3B82F6"/>
                        <rect x="160" y="80" width="20" height="50" rx="8" fill="#3B82F6"/>
                        
                        {/* Smile */}
                        <path d="M85 145Q100 155 115 145" stroke="#22D3EE" strokeWidth="4" strokeLinecap="round"/>
                      </svg>
                  </div>
                  
                  <h1 className="text-6xl md:text-8xl font-black text-cyan-400 mb-4 font-tech tracking-wider drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]">
                      CODE CRAFT
                  </h1>
                  <h2 className="text-2xl md:text-3xl font-bold text-slate-300 mb-12 font-tech tracking-wide">
                      &lt; บทเรียน Block Coding เบื้องต้น /&gt;
                  </h2>

                  <button 
                    onClick={handleStart}
                    className="group relative px-12 py-6 bg-green-500 rounded-full shadow-[0_0_20px_rgba(34,197,94,0.6)] hover:bg-green-400 hover:scale-105 hover:shadow-[0_0_40px_rgba(34,197,94,0.8)] transition-all duration-300"
                  >
                      <span className="text-3xl font-bold text-white flex items-center gap-3 font-display">
                          <Play fill="currentColor" /> เริ่มเรียนรู้
                      </span>
                      <div className="absolute inset-0 rounded-full ring-4 ring-green-300 animate-ping opacity-30"></div>
                  </button>

                  <div className="mt-16 pt-8 border-t border-slate-700 w-full text-slate-400">
                      <p className="text-sm font-semibold text-cyan-500 mb-2">DEVELOPER</p>
                      <p className="text-xl font-bold text-white mb-1">นายธนิท ธนพัตนิรัชกุล</p>
                      <p className="text-slate-300">ตำแหน่งครู โรงเรียนกาฬสินธุ์ปัญญานุกูล จังหวัดกาฬสินธุ์</p>
                  </div>
              </div>
          </div>
      );
  }

  // --- CERTIFICATE MODAL ---
  if (showCertificate) {
      return (
          <div className="h-screen w-full bg-indigo-900/90 backdrop-blur-sm flex items-center justify-center p-4 z-50 fixed inset-0">
             <div className="bg-white rounded-3xl p-10 max-w-3xl w-full text-center border-8 border-yellow-400 shadow-2xl animate-in zoom-in duration-700 relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500"></div>
                 
                 <div className="flex justify-center mb-6">
                     <Award className="w-32 h-32 text-yellow-400 drop-shadow-lg animate-bounce" fill="currentColor" />
                 </div>
                 
                 <h1 className="text-4xl md:text-5xl font-black text-indigo-800 mb-6 font-display">
                     ยินดีด้วย!
                 </h1>
                 <p className="text-2xl md:text-3xl text-gray-700 font-bold mb-8 leading-relaxed">
                     คุณได้เรียนจบหลักสูตร<br/>
                     <span className="text-indigo-600">Block Coding เบื้องต้น</span> แล้ว
                 </p>
                 
                 <div className="flex justify-center gap-4">
                     <button 
                        onClick={() => {
                            setShowCertificate(false);
                            setShowLanding(true);
                            setCurrentLevelIndex(0);
                            setCompletedLevels([]);
                            if (bgmRef.current) bgmRef.current.pause();
                        }}
                        className="px-8 py-4 bg-green-500 text-white rounded-full text-xl font-bold shadow-lg hover:bg-green-400 hover:scale-105 transition-all flex items-center gap-2"
                     >
                        <Home /> กลับหน้าแรก
                     </button>
                 </div>
             </div>
          </div>
      );
  }

  // --- MAIN APP ---
  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden font-sans relative">
      
      <TutorialOverlay />
      <BlockGuideModal />

      {/* Top Bar */}
      <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-8 shadow-sm z-20 relative">
          <button onClick={() => setShowLanding(true)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-indigo-600 absolute left-4">
               <Home size={28} />
          </button>
          
          <div className="flex-1 flex justify-center items-center gap-3">
             <Bot className="text-indigo-600 w-8 h-8 md:w-10 md:h-10" />
             <span className="text-3xl font-black text-indigo-800 tracking-tight drop-shadow-sm font-display">Code Craft</span>
          </div>

          <div className="absolute right-4 flex items-center gap-2">
               <button 
                  onClick={toggleMusic}
                  className={`p-3 rounded-full transition-all ${isMusicPlaying ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}
                  title="เปิด/ปิด เพลง"
               >
                   {isMusicPlaying ? <Music size={24} className="animate-pulse" /> : <Music4 size={24} />}
               </button>
          </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Panel */}
        <div className={`w-full md:w-3/12 flex flex-col border-r border-gray-200 bg-white shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-300 ${tutorialStep === 1 ? 'z-50 ring-4 ring-yellow-400 scale-[1.02]' : 'z-10'}`}>
            <div className="bg-indigo-500 text-white text-center py-1 font-bold text-sm uppercase tracking-widest shadow-inner">
               ส่วนคำสั่ง
            </div>

            <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
               {/* Hide Nav buttons in Tutorial Mode */}
               <button 
                  onClick={() => setCurrentLevelIndex(Math.max(0, currentLevelIndex - 1))}
                  disabled={isTutorialMode || currentLevelIndex === 0}
                  className={`p-2 bg-white rounded-lg hover:bg-indigo-100 disabled:opacity-30 disabled:hover:bg-white shadow-sm transition-all text-indigo-700 ${isTutorialMode ? 'invisible' : ''}`}
               >
                  <ChevronLeft size={32} />
               </button>
               <div className="text-center">
                   <span className="text-sm text-indigo-400 font-bold uppercase tracking-wider">บทเรียน</span>
                   <div className="text-2xl font-black text-indigo-800 leading-none">
                       {isTutorialMode ? 'ฝึกสอน' : `${activeLevel.id} / ${LEVELS.length}`}
                   </div>
               </div>
               <button 
                  onClick={() => setCurrentLevelIndex(Math.min(LEVELS.length - 1, currentLevelIndex + 1))}
                  disabled={isTutorialMode || currentLevelIndex === LEVELS.length - 1}
                  className={`p-2 bg-white rounded-lg hover:bg-indigo-100 disabled:opacity-30 disabled:hover:bg-white shadow-sm transition-all text-indigo-700 ${isTutorialMode ? 'invisible' : ''}`}
               >
                  <ChevronRight size={32} />
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="bg-yellow-50 p-6 rounded-3xl border-2 border-yellow-200 shadow-sm relative group">
                    <button 
                        onClick={() => speak(activeLevel.title + ". " + activeLevel.description)}
                        className="absolute top-3 right-3 p-3 bg-white rounded-full shadow-sm hover:scale-110 text-yellow-500 transition-all"
                    >
                        <Volume2 size={24} />
                    </button>
                    <h2 className="text-2xl font-black text-indigo-900 mb-3">{activeLevel.title}</h2>
                    <p className="text-xl text-gray-700 leading-relaxed font-medium">
                        {activeLevel.description}
                    </p>
                </div>
                
                <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
                    <h3 className="text-lg font-bold text-blue-800 mb-2 flex items-center gap-2">
                        💡 คำใบ้:
                    </h3>
                    <p className="text-lg text-blue-700">{activeLevel.hint}</p>
                </div>

                {!isTutorialMode && (
                    <div className="pt-4 border-t border-gray-100">
                        <p className="text-gray-400 font-bold text-sm mb-3 text-center">ความคืบหน้าของคุณ</p>
                        <div className="grid grid-cols-5 gap-2 px-2 pb-10">
                            {LEVELS.map((l, idx) => (
                                <button 
                                key={l.id}
                                onClick={() => setCurrentLevelIndex(idx)}
                                className={`
                                    aspect-square rounded-xl flex items-center justify-center font-bold text-lg transition-all
                                    ${currentLevelIndex === idx ? 'ring-2 ring-indigo-400 ring-offset-2 scale-105 z-10' : ''}
                                    ${completedLevels.includes(l.id) 
                                        ? 'bg-green-400 text-white shadow-green-200' 
                                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}
                                `}
                                >
                                {l.id}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Middle Panel: Workspace */}
        <div className={`w-full md:w-5/12 flex flex-col relative bg-slate-100 border-r border-gray-200 transition-all duration-300 ${tutorialStep === 2 || tutorialStep === 3 ? 'z-50 ring-4 ring-yellow-400 scale-[1.02]' : 'z-0'}`}>
            <div className="bg-indigo-500 text-white text-center py-1 font-bold text-sm uppercase tracking-widest shadow-inner flex justify-center items-center gap-2">
                <Code size={14} /> พื้นที่เขียนโค้ด
            </div>

            <div className="flex-1 relative">
                <BlocklyComponent 
                    key={isTutorialMode ? 'tutorial' : currentLevelIndex} // FORCE RE-RENDER TO CLEAR BLOCKS
                    initialXml={`<xml><block type="kru_start" x="40" y="40"></block></xml>`}
                    toolbox={activeLevel.allowedBlocks}
                    onCodeChange={setCode}
                    onBlockCountChange={setBlockCount}
                />
                
                <div className={`
                    absolute top-4 right-4 px-4 py-2 rounded-full font-bold shadow-md text-sm border-2
                    ${blockCount > activeLevel.idealBlockCount ? 'bg-orange-100 border-orange-200 text-orange-600' : 'bg-white border-indigo-100 text-indigo-600'}
                `}>
                    <span className="flex items-center gap-2">
                        <Puzzle size={16} /> 
                        แนะนำ: {blockCount} / {activeLevel.idealBlockCount}
                    </span>
                </div>
            </div>
            
            <div className="p-4 bg-white border-t border-gray-200 flex items-center justify-between shadow-xl z-20">
                <button 
                    onClick={resetLevel}
                    className="flex flex-col items-center gap-1 text-gray-400 hover:text-red-500 transition-colors px-4 py-2 rounded-xl hover:bg-red-50"
                >
                    <RotateCcw size={24} />
                    <span className="text-xs font-bold">เริ่มใหม่</span>
                </button>

                <div className="flex gap-2">
                    <button 
                        onClick={handleStep}
                        className="flex flex-col items-center justify-center gap-1 px-4 py-2 bg-yellow-100 text-yellow-700 rounded-xl hover:bg-yellow-200 transition-colors border-2 border-yellow-200"
                    >
                         <SkipForward size={24} />
                         <span className="text-xs font-bold">ทีละก้าว</span>
                    </button>

                    <button 
                        onClick={handleRun}
                        disabled={gameState.isRunning}
                        className={`
                            flex items-center gap-3 px-8 py-3 rounded-full shadow-lg transform transition-all
                            ${gameState.isRunning 
                                ? 'bg-gray-200 text-gray-400 cursor-wait scale-95' 
                                : 'bg-green-500 hover:bg-green-400 text-white hover:scale-105 shadow-green-200'}
                        `}
                    >
                        <Play size={28} fill="currentColor" />
                        <span className="text-xl font-black tracking-wide">รันคำสั่ง</span>
                    </button>
                </div>
            </div>
        </div>

        {/* Right Panel: Stage */}
        <div className={`w-full md:w-4/12 bg-white flex flex-col p-6 border-l border-gray-100 relative shadow-[-4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-300 ${tutorialStep === 4 ? 'z-50 ring-4 ring-yellow-400 scale-[1.02]' : 'z-0'}`}>
            <Stage level={activeLevel} gameState={gameState} />
            
            {gameState.isCompleted && !isTutorialMode && currentLevelIndex < LEVELS.length - 1 && (
                <div className="mt-6 animate-in slide-in-from-bottom duration-500 fade-in fill-mode-forwards">
                    <button 
                        onClick={() => setCurrentLevelIndex(currentLevelIndex + 1)}
                        className="w-full py-5 bg-indigo-600 text-white text-2xl font-black rounded-2xl shadow-xl shadow-indigo-200 hover:bg-indigo-500 hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center justify-center gap-3"
                    >
                        ไปบทถัดไป <ChevronRight strokeWidth={4} />
                    </button>
                </div>
            )}
             {gameState.isCompleted && isTutorialMode && (
                <div className="mt-6 animate-in slide-in-from-bottom duration-500 fade-in fill-mode-forwards">
                    <button 
                        onClick={nextTutorialStep}
                        className="w-full py-5 bg-green-500 text-white text-2xl font-black rounded-2xl shadow-xl hover:bg-green-400 transition-all"
                    >
                        เข้าใจแล้ว ไปต่อเลย!
                    </button>
                </div>
            )}
        </div>
      </div>

    </div>
  );
};

export default App;
