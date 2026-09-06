import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Markdown from 'react-native-markdown-display';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Easing,
  Dimensions,
  Modal,
  TouchableWithoutFeedback,
  Image,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import apiService from '../services/apiService';
import authService, { AuthProvider } from '../services/authService';
import Loading from '../components/Loading';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from '../context/ThemeContext';
import { RecipeDocument, GenerationOrigin, EditTurn } from '../types';
import { SUGGEST_DEBOUNCE_MS } from '../constants';
import { useAlert } from '../context/AlertContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Generate'>;
type InputMode = 'text' | 'url' | 'image' | 'voice';
type QType = 'either-or' | 'add-on';

interface ClarifyQuestion { id: string; type: QType; label: string; options: string[] }
interface DocSnapshot { recipe: string; recipeName: string; structuredDoc: RecipeDocument | null }
interface ApplyResult { message: string; options: string[] }

const { height } = Dimensions.get('window');

const fmtIngredient = (ing: RecipeDocument['ingredients'][number]): string => {
  const qty = ing.quantity_text ?? (ing.quantity != null ? `${ing.quantity}${ing.unit ? ' ' + ing.unit : ''}` : null);
  return qty ? `${qty} ${ing.item}` : ing.item;
};

const GenerateScreen: React.FC<Props> = ({ navigation }) => {
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('✨ Creating your recipe...');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [recipe, setRecipe] = useState<string | null>(null);
  const [recipeName, setRecipeName] = useState<string | null>(null);
  const [structuredDoc, setStructuredDoc] = useState<RecipeDocument | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [showSignIn, setShowSignIn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  // Cached permission state to avoid repeated OS prompts
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'unknown'>('unknown');
  const [mediaPermission, setMediaPermission] = useState<'granted' | 'denied' | 'unknown'>('unknown');
  // URL mode
  const [urlInput, setUrlInput] = useState('');
  const urlRef = useRef<TextInput>(null);
  // Image mode
  const [selectedImage, setSelectedImage] = useState<{ uri: string; name: string; mimeType?: string } | null>(null);
  const [showLightbox, setShowLightbox] = useState(false);
  // Voice soundbar
  const soundBars = useRef(Array.from({ length: 5 }, () => new Animated.Value(0.3))).current;
  const recordingRef = useRef<Audio.Recording | null>(null);
  // Web SpeechRecognition ref
  const speechRecognitionRef = useRef<any>(null);
  // Web MediaRecorder fallback (Firefox)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // Flag so onstop can distinguish confirm vs abort
  const recordingAbortedRef = useRef(false);
  const borderAnim = useRef(new Animated.Value(0)).current;
  const { theme, isDark, toggle } = useTheme();
  const { showAlert } = useAlert();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { width: windowWidth } = useWindowDimensions();
  const isWebWide = Platform.OS === 'web' && windowWidth > 720;

  // Guided generation
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string[]>>({});
  const [dynamicPrefs, setDynamicPrefs] = useState<ClarifyQuestion[]>([]);
  const [showPrefs, setShowPrefs] = useState(false);
  const prefsAnim = useRef(new Animated.Value(0)).current;
  const prefsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recipe review
  const [editableIngredients, setEditableIngredients] = useState<RecipeDocument['ingredients']>([]);
  const [editableSteps, setEditableSteps] = useState<RecipeDocument['steps']>([]);

  // Apply-changes pane: mark ingredients to remove, add optional context, apply once
  const [markedForRemoval, setMarkedForRemoval] = useState<Set<number>>(new Set());
  const [extraContext, setExtraContext] = useState('');
  const [applyPending, setApplyPending] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [docHistory, setDocHistory] = useState<DocSnapshot[]>([]);

  // Full generation conversation, kept alive for the length of the review session so
  // refinements (and the eventual save) stay traceable to the original ask.
  const [origin, setOrigin] = useState<GenerationOrigin | null>(null);
  const [initialStructuredDoc, setInitialStructuredDoc] = useState<RecipeDocument | null>(null);
  const [editHistory, setEditHistory] = useState<EditTurn[]>([]);

  // Recently saved
  const [recentlySaved, setRecentlySaved] = useState<{ id: number; name: string } | null>(null);

  // LLM-powered inline suggestion
  const [suggestion, setSuggestion] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [topicRejected, setTopicRejected] = useState(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputRef = useRef<TextInput>(null);

  // Typewriter placeholder
  const [typedPlaceholder, setTypedPlaceholder] = useState('');
  const phraseIdx = useRef(0);
  const charIdx = useRef(0);
  const isErasing = useRef(false);

  useEffect(() => {
    if (inputText || isFocused || inputMode !== 'text') {
      setTypedPlaceholder('');
      return;
    }
    const phrases = [
      'A creamy pasta with sun-dried tomatoes and spinach…',
      'Something warm and spicy for a cold evening…',
      'Healthy meal prep using chicken and quinoa…',
      'I have leftover rice, eggs, and soy sauce…',
      'A birthday cake that tastes like tiramisu…',
      'Quick 15-minute dinner for two, no oven needed…',
      'Vegan tacos with a smoky chipotle kick…',
      'Classic French onion soup, rich and cheesy…',
      'Something my kids will actually eat — picky eaters!',
      'A refreshing summer salad with mango and avocado…',
      'Homemade ramen broth, the kind that takes all day…',
      'Gluten-free chocolate lava cake for dessert tonight…',
      'Sheet pan salmon with roasted vegetables…',
      'I want to impress guests with a three-course dinner…',
      'Street food inspired — crispy falafel wraps…',
      'Comfort food: mac and cheese but elevated…',
      'Keto-friendly breakfast with under 5 ingredients…',
      'A soup that uses up whatever is in the fridge…',
      "Something from my grandmother's kitchen — goulash…",
      'Fluffy Japanese milk bread from scratch…',
    ];
    let tid: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const phrase = phrases[phraseIdx.current];
      if (!isErasing.current) {
        if (charIdx.current < phrase.length) {
          charIdx.current += 1;
          setTypedPlaceholder(phrase.slice(0, charIdx.current));
          tid = setTimeout(tick, 38);
        } else {
          isErasing.current = true;
          tid = setTimeout(tick, 2000);
        }
      } else {
        if (charIdx.current > 0) {
          charIdx.current -= 1;
          setTypedPlaceholder(phrase.slice(0, charIdx.current));
          tid = setTimeout(tick, 22);
        } else {
          isErasing.current = false;
          phraseIdx.current = (phraseIdx.current + 1) % phrases.length;
          tid = setTimeout(tick, 350);
        }
      }
    };

    tid = setTimeout(tick, 38);
    return () => { cancelled = true; clearTimeout(tid); };
  }, [inputText, isFocused, inputMode]);

  const acceptSuggestion = useCallback(() => {
    if (!suggestion) return;
    setInputText(prev => prev.trimEnd() + ' ' + suggestion);
    setSuggestion('');
  }, [suggestion]);

  // Debounced LLM suggestion fetch
  useEffect(() => {
    let cancelled = false;
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    const q = inputText.trim();
    if (!q || q.length < 4 || inputMode !== 'text') { setSuggestion(''); setTopicRejected(false); return () => { cancelled = true; }; }
    suggestTimer.current = setTimeout(async () => {
      if (cancelled) return;
      setIsSuggesting(true);
      try {
        const s = await apiService.suggestInput(q);
        if (!cancelled) { setSuggestion(s.trim()); setTopicRejected(false); }
      } catch (error: any) {
        if (!cancelled && error?.response?.status === 422) {
          setTopicRejected(true);
          setSuggestion('');
        }
      } finally {
        if (!cancelled) setIsSuggesting(false);
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => { cancelled = true; if (suggestTimer.current) clearTimeout(suggestTimer.current); };
  }, [inputText, inputMode]);

  // Tab key accepts suggestion on web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && suggestion) { e.preventDefault(); acceptSuggestion(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [suggestion, acceptSuggestion]);

  // Dynamic preference chips: LLM-generated, debounced, fade in/out smoothly
  useEffect(() => {
    let cancelled = false;
    if (prefsTimer.current) clearTimeout(prefsTimer.current);
    const q = inputText.trim();
    if (q.length >= 4 && inputMode === 'text') {
      prefsTimer.current = setTimeout(async () => {
        if (cancelled) return;
        const prefs = await apiService.suggestPrefs(q);
        if (!cancelled && prefs.length > 0) {
          setDynamicPrefs(prefs as ClarifyQuestion[]);
          setShowPrefs(true);
          Animated.timing(prefsAnim, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
        }
      }, 700);
    } else {
      Animated.timing(prefsAnim, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true })
        .start(({ finished }) => { if (finished) { setShowPrefs(false); setDynamicPrefs([]); } });
    }
    return () => { cancelled = true; if (prefsTimer.current) clearTimeout(prefsTimer.current); };
  }, [inputText, inputMode]);

  // ── Clipboard paste (web: global paste event; native: explicit button) ──
  const handleClipboardImage = useCallback(async (dataUrl: string, mime: string) => {
    setSelectedImage({ uri: dataUrl, name: 'clipboard.png', mimeType: mime });
    setInputMode('image');
    expand();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find(i => i.type.startsWith('image/'));
      if (!imageItem) return;
      e.preventDefault();
      const blob = imageItem.getAsFile();
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = () => handleClipboardImage(reader.result as string, imageItem.type);
      reader.readAsDataURL(blob);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleClipboardImage]);

  const handleNativeClipboardPaste = async () => {
    try {
      const result = await Clipboard.getImageAsync({ format: 'png' });
      if (!result) { showAlert('No image', 'Clipboard does not contain an image'); return; }
      await handleClipboardImage(result.data, 'image/png');
    } catch { showAlert('Error', 'Failed to read image from clipboard'); }
  };

  const URL_REGEX = /^https?:\/\/(([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(:\d+)?(\/[^\s]*)?$/;
  const isValidUrl = urlInput.trim() !== '' && URL_REGEX.test(urlInput.trim());
  const urlHasInput = urlInput.trim().length > 0;

  useEffect(() => {
    checkAuthStatus();
    const unsubscribe = navigation.addListener('focus', checkAuthStatus);
    return unsubscribe;
  }, [navigation]);

  // Pre-request permissions on mount so the first tap has no OS-dialog delay
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Promise.all([
      Audio.requestPermissionsAsync(),
      ImagePicker.requestMediaLibraryPermissionsAsync(),
    ]).then(([mic, media]) => {
      setMicPermission(mic.status === 'granted' ? 'granted' : 'denied');
      setMediaPermission(media.status === 'granted' ? 'granted' : 'denied');
    }).catch(() => {});
  }, []);

  const checkAuthStatus = async () => {
    const authenticated = await authService.isAuthenticated();
    setIsAuthenticated(authenticated);
  };

  useEffect(() => {
    if (structuredDoc?.ingredients) setEditableIngredients([...structuredDoc.ingredients]);
    if (structuredDoc?.steps)       setEditableSteps([...structuredDoc.steps]);
    setMarkedForRemoval(new Set());
  }, [structuredDoc]);

  const expand = () => {
    setIsFocused(true);
    Animated.timing(borderAnim, { toValue: 1, duration: 180, useNativeDriver: false }).start();
  };

  const collapse = () => {
    if (!inputText) {
      setIsFocused(false);
      Animated.timing(borderAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    }
  };

  const selectMode = (mode: InputMode) => {
    if (mode === inputMode && mode !== 'image') { setInputMode('text'); if (mode === 'url') setUrlInput(''); return; }
    setInputMode(mode);
    if (mode === 'image') { handleImagePick(); return; }
    if (mode === 'url')   { expand(); setTimeout(() => urlRef.current?.focus(), 100); return; }
    inputRef.current?.focus();
    expand();
  };

  const buildDescription = useCallback((): string => {
    const parts: string[] = [inputText.trim()];
    const activeIds  = new Set(dynamicPrefs.map(q => q.id));
    const activeOpts = new Set(dynamicPrefs.flatMap(q => q.options));
    const servings   = clarifyAnswers['servings']?.[0];
    const diet       = (clarifyAnswers['diet'] ?? []).filter(o => activeOpts.has(o));
    const difficulty = clarifyAnswers['difficulty']?.[0];
    if (servings && activeIds.has('servings'))     parts.push(`for ${servings} servings`);
    if (diet.length)                               parts.push(diet.join(' and '));
    if (difficulty && activeIds.has('difficulty')) parts.push(difficulty);
    return parts.filter(Boolean).join(', ');
  }, [inputText, clarifyAnswers, dynamicPrefs]);

  const toggleClarifyAnswer = (qid: string, option: string, type: QType) => {
    setClarifyAnswers(prev => {
      const current = prev[qid] ?? [];
      if (type === 'either-or') return { ...prev, [qid]: current[0] === option ? [] : [option] };
      return { ...prev, [qid]: current.includes(option) ? current.filter(o => o !== option) : [...current, option] };
    });
  };

  const resetReview = () => {
    setRecipe(null); setRecipeName(null); setStructuredDoc(null);
    setEditableIngredients([]); setEditableSteps([]);
    setMarkedForRemoval(new Set()); setExtraContext(''); setApplyPending(false); setApplyResult(null);
    setDocHistory([]);
    setOrigin(null); setInitialStructuredDoc(null); setEditHistory([]);
  };

  const toggleMarkedForRemoval = (idx: number) => {
    setMarkedForRemoval(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // Apply every marked removal plus optional context as one instruction; the backend
  // regenerates the full structured document so ingredients/steps stay consistent with
  // each other. It may also refuse (status "rejected") or ask us to pick a substitution
  // (status "needs_choice") instead of applying — chosenOption re-submits with that pick.
  const applyChanges = async (chosenOption?: string) => {
    if (!recipe || !origin || !initialStructuredDoc || applyPending) return;
    const removed = editableIngredients.filter((_, i) => markedForRemoval.has(i)).map(fmtIngredient);
    if (removed.length === 0 && !extraContext.trim() && !chosenOption) return;

    const parts: string[] = [];
    if (removed.length > 0) parts.push(`Remove: ${removed.join(', ')}.`);
    if (chosenOption) parts.push(chosenOption);
    if (extraContext.trim()) parts.push(extraContext.trim());
    const instruction = parts.join(' ');

    setDocHistory(prev => [...prev, { recipe: recipe!, recipeName: recipeName ?? '', structuredDoc }]);
    setApplyPending(true);
    setApplyResult(null);
    try {
      const result = await apiService.refineRecipe(origin, initialStructuredDoc, editHistory, instruction);
      if (result.status !== 'applied' || !result.structured) {
        setDocHistory(prev => prev.slice(0, -1));
        setApplyResult({ message: result.message ?? "Couldn't apply that change.", options: result.options ?? [] });
        return;
      }
      setRecipe(result.recipe!);
      setRecipeName(result.recipename!);
      setStructuredDoc(result.structured);
      setEditHistory(prev => [...prev, { change_prompt: instruction, structured: result.structured! }]);
      setMarkedForRemoval(new Set());
      setExtraContext('');
      setApplyResult(null);
    } catch {
      setDocHistory(prev => prev.slice(0, -1));
      setApplyResult({ message: "Sorry, couldn't apply that. Try again.", options: [] });
    } finally {
      setApplyPending(false);
    }
  };

  const handleUndoChat = () => {
    setDocHistory(prev => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      setRecipe(snapshot.recipe);
      setRecipeName(snapshot.recipeName);
      setStructuredDoc(snapshot.structuredDoc);
      setEditHistory(hist => hist.slice(0, -1));
      setApplyResult(null);
      return prev.slice(0, -1);
    });
  };

  const handleGenerate = async () => {
    if (inputMode === 'url') {
      if (!isValidUrl) { showAlert('Invalid URL', 'Must start with http:// or https://'); return; }
      setLoading(true); setLoadingMessage('🔗 Fetching recipe from URL...');
      try {
        const r = await apiService.generateByLink(urlInput.trim());
        setRecipe(r.recipe); setRecipeName(r.recipename); setStructuredDoc(r.structured ?? null);
        setOrigin({ prompt: urlInput.trim(), source_type: 'url', source_url: urlInput.trim() });
        setInitialStructuredDoc(r.structured ?? null); setEditHistory([]);
        setUrlInput(''); setInputMode('text'); setIsFocused(false);
      } catch { showAlert('No recipe found', 'Could not extract a recipe from that URL. Make sure it links directly to a recipe page.'); }
      finally { setLoading(false); }
      return;
    }
    if (inputMode === 'image') {
      if (!selectedImage) { showAlert('No Image', 'Please select an image first'); return; }
      setLoading(true); setLoadingMessage('📷 Analysing image...');
      try {
        const r = await apiService.generateByImage(selectedImage.uri);
        setRecipe(r.recipe); setRecipeName(r.recipename); setStructuredDoc(r.structured ?? null);
        setOrigin({ prompt: '', source_type: 'image' });
        setInitialStructuredDoc(r.structured ?? null); setEditHistory([]);
        setSelectedImage(null); setInputMode('text'); setIsFocused(false);
      } catch { showAlert('Error', 'Failed to generate recipe from image'); }
      finally { setLoading(false); }
      return;
    }
    const description = buildDescription();
    if (!description) { showAlert('Input Required', "Please describe what you'd like to cook"); return; }
    setLoading(true); setLoadingMessage('✨ Creating your recipe...');
    try {
      const r = await apiService.generateByDescription(description);
      setRecipe(r.recipe); setRecipeName(r.recipename); setStructuredDoc(r.structured ?? null);
      setOrigin({ prompt: description, source_type: 'text' });
      setInitialStructuredDoc(r.structured ?? null); setEditHistory([]);
      setInputText(''); setIsFocused(false); setInputMode('text'); setClarifyAnswers({});
      prefsAnim.setValue(0); setShowPrefs(false); setDynamicPrefs([]);
    } catch { showAlert('Error', 'Failed to generate recipe. Please try again.'); }
    finally { setLoading(false); }
  };

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

  const handleImagePick = async () => {
    try {
      if (mediaPermission !== 'granted') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { showAlert('Permission Required', 'Please grant camera roll permissions'); setInputMode('text'); return; }
        setMediaPermission('granted');
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.85, exif: false });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.mimeType && !ALLOWED_IMAGE_TYPES.includes(asset.mimeType)) { showAlert('Unsupported Format', `Only JPG, PNG, WebP and GIF are supported.`); setInputMode('text'); return; }
        const uriPath = asset.uri.split('?')[0];
        const ext = uriPath.includes('.') ? uriPath.split('.').pop()?.toLowerCase() : undefined;
        if (ext && ext.length <= 5 && !ALLOWED_EXTENSIONS.includes('.' + ext)) { showAlert('Unsupported Format', 'Only JPG, PNG, WebP and GIF images are supported.'); setInputMode('text'); return; }
        setSelectedImage({ uri: asset.uri, name: asset.fileName ?? (ext ? `photo.${ext}` : 'photo.jpg'), mimeType: asset.mimeType ?? 'image/jpeg' });
        setInputMode('image'); expand();
      } else { setInputMode('text'); }
    } catch { showAlert('Error', 'Failed to pick image'); setInputMode('text'); }
  };

  const startSoundbars = useCallback(() => {
    soundBars.forEach((bar, i) => {
      Animated.loop(Animated.sequence([
        Animated.delay(i * 90),
        Animated.timing(bar, { toValue: 1, duration: 280 + i * 40, useNativeDriver: true }),
        Animated.timing(bar, { toValue: 0.12, duration: 280 + i * 40, useNativeDriver: true }),
      ])).start();
    });
  }, [soundBars]);

  const stopSoundbars = useCallback(() => {
    soundBars.forEach(bar => { bar.stopAnimation(); bar.setValue(0.3); });
  }, [soundBars]);

  const handleVoiceRecord = async () => {
    // ── Web ─────────────────────────────────────────────────────────────────
    if (Platform.OS === 'web') {
      const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

      // ── Stop ──
      if (isRecording) {
        if (SR && speechRecognitionRef.current) {
          speechRecognitionRef.current.stop();
        } else if (mediaRecorderRef.current) {
          recordingAbortedRef.current = false;
          setIsRecording(false); stopSoundbars(); // close overlay immediately
          mediaRecorderRef.current.stop(); // onstop will handle transcription
        }
        return;
      }

      // ── Start: prefer native SpeechRecognition (Chrome/Safari/Edge) ──
      if (SR) {
        const recognition = new SR();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.onresult = (e: any) => {
          const transcript = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join('');
          setInputText(transcript);
        };
        recognition.onend = () => {
          setIsRecording(false); stopSoundbars(); setInputMode('text');
          speechRecognitionRef.current = null;
          expand(); inputRef.current?.focus();
        };
        recognition.onerror = () => {
          showAlert('Error', 'Speech recognition failed');
          setIsRecording(false); stopSoundbars(); setInputMode('text');
          speechRecognitionRef.current = null;
        };
        speechRecognitionRef.current = recognition;
        recognition.start();
        setIsRecording(true); setInputMode('voice'); startSoundbars(); expand();
        return;
      }

      // ── Fallback: MediaRecorder → backend Whisper (Firefox) ──
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Pick the best supported MIME type so the file extension matches the data
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm';
        const ext = mimeType.startsWith('audio/ogg') ? 'ogg' : 'webm';
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        recorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          mediaRecorderRef.current = null;
          setIsRecording(false); stopSoundbars();
          if (recordingAbortedRef.current) { recordingAbortedRef.current = false; return; }
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          setLoading(true); setLoadingMessage('🎤 Transcribing...');
          try {
            const text = await apiService.transcribeBlob(blob, `recording.${ext}`);
            if (text.trim()) {
              setInputText(prev => (prev.trim() ? prev.trimEnd() + ' ' + text.trim() : text.trim()));
              expand(); inputRef.current?.focus();
            }
          } catch { showAlert('Error', 'Failed to transcribe voice'); }
          finally { setLoading(false); setInputMode('text'); }
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecording(true); setInputMode('voice'); startSoundbars(); expand();
      } catch { showAlert('Error', 'Microphone access denied'); }
      return;
    }

    // ── Native: record audio then transcribe via backend ────────────────────
    if (isRecording) {
      try {
        setIsRecording(false); stopSoundbars();
        await recordingRef.current?.stopAndUnloadAsync();
        const uri = recordingRef.current?.getURI();
        recordingRef.current = null;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        if (uri) {
          setLoading(true); setLoadingMessage('🎤 Transcribing...');
          try {
            const text = await apiService.transcribeAudio(uri);
            if (text.trim()) {
              setInputText(prev => (prev.trim() ? prev.trimEnd() + ' ' + text.trim() : text.trim()));
              setInputMode('text'); expand(); inputRef.current?.focus();
            }
          } catch { showAlert('Error', 'Failed to transcribe voice'); }
          finally { setLoading(false); setInputMode('text'); }
        }
      } catch { showAlert('Error', 'Failed to stop recording'); setIsRecording(false); stopSoundbars(); recordingRef.current = null; }
    } else {
      try {
        if (micPermission !== 'granted') {
          const { status } = await Audio.requestPermissionsAsync();
          if (status !== 'granted') { showAlert('Permission Required', 'Please grant microphone access'); return; }
          setMicPermission('granted');
        }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        recordingRef.current = recording; setIsRecording(true); setInputMode('voice'); startSoundbars(); expand();
      } catch { showAlert('Error', 'Failed to start recording'); }
    }
  };

  const handleAbortRecording = async () => {
    if (Platform.OS === 'web') {
      speechRecognitionRef.current?.abort();
      speechRecognitionRef.current = null;
      if (mediaRecorderRef.current) {
        recordingAbortedRef.current = true; // prevent onstop from transcribing
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }
      setIsRecording(false); stopSoundbars(); setInputMode('text');
      return;
    }
    try {
      setIsRecording(false); stopSoundbars();
      await recordingRef.current?.stopAndUnloadAsync();
      recordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      setInputMode('text');
    } catch { setIsRecording(false); recordingRef.current = null; setInputMode('text'); }
  };

  const handleSaveRecipe = async () => {
    if (!isAuthenticated) { setShowSignIn(true); return; }
    if (!recipe || !recipeName) return;
    setLoading(true); setLoadingMessage('💾 Saving recipe...');
    try {
      const history: EditTurn[] | undefined = initialStructuredDoc
        ? [{ change_prompt: '', structured: initialStructuredDoc }, ...editHistory]
        : undefined;
      const saved = await apiService.saveRecipe(
        recipeName, recipe, undefined, structuredDoc ?? undefined, origin ?? undefined, history
      );
      setRecentlySaved({ id: saved.id, name: saved.recipename });
      resetReview();
    } catch (error: any) {
      if (error?.response?.status === 401) {
        await authService.logout();
        setIsAuthenticated(false);
        showAlert('Session expired', 'Please sign in again to save this recipe.');
        setShowSignIn(true);
      } else {
        showAlert('Error', 'Failed to save recipe');
      }
    }
    finally { setLoading(false); }
  };

  const handleSignIn = async (provider: AuthProvider) => {
    setShowSignIn(false); setLoading(true); setLoadingMessage('Signing in...');
    try {
      const profile = await authService.login(provider);
      if (profile) { setIsAuthenticated(true); showAlert('Welcome!', `Signed in as ${profile.name}`); }
      else showAlert('Sign In Failed', 'Please try again.');
    } catch { showAlert('Error', 'An error occurred during sign in.'); }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleLogout = async () => { await authService.logout(); setIsAuthenticated(false); };

  const canGenerate = (inputMode === 'url' && isValidUrl) || (inputMode === 'image' && !!selectedImage) || (inputMode === 'text' && inputText.trim().length > 0);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Loading visible={loading} message={loadingMessage} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.logo}>RecipeGenerator</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconButton} onPress={toggle}>
            <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={21} color={theme.subtext} />
          </TouchableOpacity>
          {isAuthenticated ? (
            <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Profile')}>
              <Ionicons name="person-circle-outline" size={23} color={theme.subtext} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.signInChip} onPress={() => setShowSignIn(true)}>
              <Text style={styles.signInChipText}>Sign in</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* ══════════════════════ STEP: input ══════════════════════ */}
        {!recipe && (
          <View style={styles.centerContainer}>
          <View style={[styles.inputAndPrefs, isWebWide && styles.inputAndPrefsWeb]}>
            <Animated.View
              style={[styles.promptBox, isWebWide && styles.promptBoxWeb, { borderColor: borderAnim.interpolate({ inputRange: [0, 1], outputRange: [theme.border, theme.accent] }) }]}
            >
              {inputMode === 'url' && (
                <View style={styles.urlChipWrapper}>
                  <Ionicons name="link" size={13} color={isValidUrl ? '#4caf50' : urlHasInput ? theme.accent : theme.muted} style={{ marginRight: 6 }} />
                  <TextInput ref={urlRef} style={[styles.urlChipInput, { outlineStyle: 'none' } as any]} placeholder="Paste a recipe URL…" placeholderTextColor={theme.muted} selectionColor={theme.accent} value={urlInput} onChangeText={setUrlInput} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="next" onSubmitEditing={() => inputRef.current?.focus()} />
                  {urlHasInput ? (
                    <TouchableOpacity onPress={() => setUrlInput('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close-circle" size={15} color={theme.muted} /></TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => { setUrlInput(''); setInputMode('text'); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close" size={15} color={theme.muted} /></TouchableOpacity>
                  )}
                </View>
              )}
              {urlHasInput && !isValidUrl && inputMode === 'url' && <Text style={styles.urlError}>Not a valid URL</Text>}

              {inputMode === 'image' && selectedImage && (
                <View style={styles.imagePreviewWrapper}>
                  <TouchableOpacity onPress={() => setShowLightbox(true)} activeOpacity={0.85} style={{ width: 80, height: 80 }}>
                    <Image source={{ uri: selectedImage.uri }} style={styles.imageThumbnail} resizeMode="cover" />
                    <View style={styles.imageZoomBadge}><Ionicons name="expand-outline" size={12} color="#fff" /></View>
                  </TouchableOpacity>
                  <View style={styles.imageFileMeta}>
                    <Text style={styles.imageFileName} numberOfLines={2}>{selectedImage.name}</Text>
                    <Text style={styles.imageMime}>{selectedImage.mimeType}</Text>
                  </View>
                  <TouchableOpacity style={styles.imageRemoveBtn} onPress={() => { setSelectedImage(null); setInputMode('text'); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="trash-outline" size={17} color="#cc4444" />
                  </TouchableOpacity>
                </View>
              )}

              <TextInput
                ref={inputRef}
                style={[styles.input, isWebWide && styles.inputWebWide, { outlineStyle: 'none' } as any]}
                placeholder={inputMode === 'url' ? 'Add context (optional)…' : (typedPlaceholder || 'What would you like to cook?')}
                placeholderTextColor={theme.muted}
                selectionColor={theme.accent}
                value={inputText}
                onChangeText={text => { setInputText(text); setSuggestion(''); setTopicRejected(false); }}
                onFocus={expand} onBlur={collapse}
                multiline returnKeyType="done" blurOnSubmit onSubmitEditing={handleGenerate}
              />

              {inputMode === 'text' && topicRejected && (
                <View style={styles.topicErrorRow}>
                  <Ionicons name="warning" size={14} color="#e53935" />
                  <Text style={styles.topicErrorText}>We can only process food-related topics</Text>
                </View>
              )}
              {inputMode === 'text' && !topicRejected && (suggestion || isSuggesting) && (
                <TouchableOpacity style={styles.suggestionRow} onPress={acceptSuggestion} activeOpacity={0.7} disabled={isSuggesting}>
                  {isSuggesting ? (
                    <Text style={styles.suggestionLoadingText}>…</Text>
                  ) : (
                    <>
                      <Text style={styles.suggestionGhostText} numberOfLines={2}>
                        {inputText.trimEnd()} <Text style={styles.suggestionCompletion}>{suggestion}</Text>
                      </Text>
                      <Text style={styles.suggestionHint}>{Platform.OS === 'web' ? 'Tab' : '↵'}</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <View style={styles.toolbarRow}>
                <View style={styles.toolbarLeft}>
                  <TouchableOpacity style={[styles.toolbarBtn, inputMode === 'url' && styles.toolbarBtnActive]} onPress={() => selectMode('url')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="link" size={17} color={inputMode === 'url' ? theme.accent : theme.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.toolbarBtn, inputMode === 'image' && styles.toolbarBtnActive]} onPress={() => selectMode('image')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="image-outline" size={17} color={inputMode === 'image' ? theme.accent : theme.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.toolbarBtn} onPress={handleVoiceRecord} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="mic-outline" size={17} color={theme.muted} />
                  </TouchableOpacity>
                  {Platform.OS !== 'web' && (
                    <TouchableOpacity style={styles.toolbarBtn} onPress={handleNativeClipboardPaste} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Ionicons name="clipboard-outline" size={17} color={theme.muted} />
                    </TouchableOpacity>
                  )}
                </View>
                {canGenerate && (
                  <TouchableOpacity
                    style={[styles.generateButton, topicRejected && styles.generateButtonDisabled]}
                    onPress={handleGenerate}
                    disabled={topicRejected}
                  >
                    <Text style={styles.generateButtonText}>Generate ↵</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>

            {/* Context-aware preference chips — always in DOM on web to prevent layout shift */}
            {(showPrefs || isWebWide) && (
              <Animated.View
                style={[styles.prefsWrap, isWebWide && styles.prefsWrapWeb, { opacity: prefsAnim }]}
                pointerEvents={showPrefs ? 'auto' : 'none'}
              >
                {dynamicPrefs.map((q, groupIdx) => {
                  const groupOpacity = prefsAnim.interpolate({
                    inputRange: [Math.max(0, groupIdx * 0.18), Math.min(1, groupIdx * 0.18 + 0.65)],
                    outputRange: [0, 1],
                    extrapolate: 'clamp',
                  });
                  return (
                    <Animated.View key={q.id} style={[styles.prefsGroup, { opacity: groupOpacity }]}>
                      <Text style={styles.prefsGroupLabel}>{q.label}</Text>
                      <View style={styles.prefsRow}>
                        {q.options.map(opt => {
                          const sel = (clarifyAnswers[q.id] ?? []).includes(opt);
                          return (
                            <TouchableOpacity key={opt} style={[styles.prefChip, sel && styles.prefChipSel]} onPress={() => toggleClarifyAnswer(q.id, opt, q.type as QType)}>
                              <Text style={[styles.prefChipText, sel && styles.prefChipTextSel]}>{opt}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </Animated.View>
                  );
                })}
              </Animated.View>
            )}

          </View>

            <Text style={styles.helperText}>describe a dish · paste a URL · upload an image · use voice</Text>

            {recentlySaved && (
              <TouchableOpacity style={styles.recentlySavedPill} onPress={() => navigation.navigate('Recipes')}>
                <Ionicons name="checkmark-circle" size={15} color="#4caf50" style={{ marginRight: 6 }} />
                <Text style={styles.recentlySavedText} numberOfLines={1}>Added: {recentlySaved.name}</Text>
                <Ionicons name="chevron-forward" size={13} color={theme.muted} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            )}

            {isAuthenticated && (
              <TouchableOpacity style={styles.myRecipesButton} onPress={() => navigation.navigate('Recipes')}>
                <Ionicons name="book-outline" size={17} color={theme.accent} style={{ marginRight: 6 }} />
                <Text style={styles.myRecipesButtonText}>My Recipes</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ══════════════════════ STEP: review ══════════════════════ */}
        {recipe && (
          <View style={styles.reviewScreen}>
            {/* Header */}
            <View style={styles.reviewHeader}>
              <Text style={styles.reviewTitle} numberOfLines={2}>{recipeName}</Text>
              <TouchableOpacity style={styles.closeButton} onPress={resetReview}>
                <Ionicons name="close" size={18} color={theme.subtext} />
              </TouchableOpacity>
            </View>

            {structuredDoc ? (
              <View style={[styles.reviewBody, isWebWide && styles.reviewBodyWeb]}>

                {/* ── Left / top: meta + ingredients ── */}
                <ScrollView style={[styles.ingColumn, isWebWide && styles.ingColumnWeb]} showsVerticalScrollIndicator={false}>
                  {/* Meta badges */}
                  <View style={styles.metaRow}>
                    {structuredDoc.servings != null && (
                      <View style={styles.metaBadge}><Text style={styles.metaBadgeText}>🍽 {structuredDoc.servings} servings</Text></View>
                    )}
                    {((structuredDoc.prep_minutes ?? 0) + (structuredDoc.cook_minutes ?? 0)) > 0 && (
                      <View style={styles.metaBadge}><Text style={styles.metaBadgeText}>⏱ {(structuredDoc.prep_minutes ?? 0) + (structuredDoc.cook_minutes ?? 0)} min</Text></View>
                    )}
                    {structuredDoc.difficulty != null && (
                      <View style={styles.metaBadge}><Text style={styles.metaBadgeText}>{structuredDoc.difficulty}</Text></View>
                    )}
                  </View>

                  {structuredDoc.summary != null && (
                    <Text style={styles.recipeSummary}>{structuredDoc.summary}</Text>
                  )}

                  <Text style={styles.sectionLabel}>Ingredients</Text>
                  {editableIngredients.map((ing, idx) => {
                    const marked = markedForRemoval.has(idx);
                    return (
                    <View key={idx} style={styles.ingRow}>
                      <View style={styles.ingBullet} />
                      <Text style={[styles.ingText, marked && styles.ingTextMarked]}>
                        {fmtIngredient(ing)}{ing.optional ? <Text style={styles.optLabel}>  optional</Text> : null}
                      </Text>
                      <TouchableOpacity
                        onPress={() => toggleMarkedForRemoval(idx)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={[styles.ingAction, marked && styles.ingActionMarked]}
                        disabled={applyPending}
                      >
                        <Ionicons name="close" size={16} color={marked ? '#fff' : theme.muted} />
                      </TouchableOpacity>
                    </View>
                    );
                  })}
                </ScrollView>

                {/* ── Right / bottom: steps ── */}
                <ScrollView style={[styles.stepsColumn, isWebWide && styles.stepsColumnWeb]} showsVerticalScrollIndicator={false}>
                  <Text style={styles.sectionLabel}>Steps</Text>
                  {editableSteps.map((s, idx) => (
                    <View key={idx} style={styles.stepCard}>
                      <View style={styles.stepCardMain}>
                        <View style={styles.stepNum}><Text style={styles.stepNumText}>{s.sort_order}</Text></View>
                        <Text style={styles.stepText}>{s.step_text}</Text>
                      </View>
                      {s.timer_seconds != null && (
                        <Text style={styles.stepTimer}>⏱ {Math.round(s.timer_seconds / 60)} min</Text>
                      )}
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <ScrollView style={styles.fallbackScroll} showsVerticalScrollIndicator={false}>
                <Markdown style={{ body: styles.recipeText }}>{recipe}</Markdown>
              </ScrollView>
            )}

            {/* ── Apply changes: mark ingredients above, add context, apply once ── */}
            <View style={styles.chatBar}>
              {markedForRemoval.size > 0 && (
                <Text style={styles.markedCountText}>
                  {markedForRemoval.size} ingredient{markedForRemoval.size > 1 ? 's' : ''} marked for removal
                </Text>
              )}

              {applyResult && (
                <View style={styles.applyResultBanner}>
                  <Text style={styles.applyResultText}>{applyResult.message}</Text>
                  {applyResult.options.length > 0 && (
                    <View style={styles.applyOptionsRow}>
                      {applyResult.options.map(opt => (
                        <TouchableOpacity
                          key={opt}
                          style={styles.applyOptionChip}
                          onPress={() => applyChanges(opt)}
                          disabled={applyPending}
                        >
                          <Text style={styles.applyOptionChipText}>{opt}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <View style={styles.chatInputRow}>
                <TextInput
                  style={[styles.chatInput, { outlineStyle: 'none' } as any]}
                  placeholder="Anything else to mention? (optional)"
                  placeholderTextColor={theme.muted}
                  value={extraContext}
                  onChangeText={setExtraContext}
                  selectionColor={theme.accent}
                  editable={!applyPending}
                />
              </View>
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.undoButton, docHistory.length === 0 && styles.undoButtonDisabled]}
                  onPress={handleUndoChat}
                  disabled={docHistory.length === 0}
                >
                  <Ionicons name="arrow-undo-outline" size={15} color={docHistory.length > 0 ? theme.subtext : theme.muted} style={{ marginRight: 6 }} />
                  <Text style={[styles.undoButtonText, docHistory.length === 0 && styles.undoButtonTextDisabled]}>Undo last change</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, (applyPending || (markedForRemoval.size === 0 && !extraContext.trim())) && styles.btnDisabled]}
                  onPress={() => applyChanges()}
                  disabled={applyPending || (markedForRemoval.size === 0 && !extraContext.trim())}
                >
                  {applyPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Apply changes</Text>
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.saveButtonFull} onPress={handleSaveRecipe}>
                <Text style={styles.saveButtonText}>Save to collection</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.startOverLink} onPress={resetReview}>
                <Text style={styles.startOverText}>Start over</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Voice recording overlay ── */}
      <Modal visible={isRecording} transparent animationType="fade" onRequestClose={handleAbortRecording} statusBarTranslucent>
        <View style={styles.voiceOverlay}>
          <Text style={styles.voiceTitle}>Listening…</Text>
          <Text style={styles.voiceSubtitle}>Speak your recipe idea</Text>
          <View style={styles.soundbarRow}>
            {soundBars.map((bar, i) => (
              <Animated.View key={i} style={[styles.soundbarBar, { transform: [{ scaleY: bar }], backgroundColor: i === 2 ? theme.accent : '#cc2222', opacity: bar.interpolate({ inputRange: [0.12, 1], outputRange: [0.4, 1] }) }]} />
            ))}
          </View>
          <View style={styles.voiceActions}>
            <TouchableOpacity style={styles.voiceAbortBtn} onPress={handleAbortRecording}><Ionicons name="close" size={26} color="#fff" /></TouchableOpacity>
            <TouchableOpacity style={styles.voiceConfirmBtn} onPress={handleVoiceRecord}><Ionicons name="checkmark" size={26} color="#fff" /></TouchableOpacity>
          </View>
          <Text style={styles.voiceHint}>Tap ✕ to cancel · Tap ✓ to transcribe</Text>
        </View>
      </Modal>

      {/* ── Image lightbox ── */}
      {selectedImage && (
        <Modal visible={showLightbox} transparent animationType="fade" onRequestClose={() => setShowLightbox(false)}>
          <TouchableWithoutFeedback onPress={() => setShowLightbox(false)}>
            <View style={styles.lightboxOverlay}>
              <Image source={{ uri: selectedImage.uri }} style={styles.lightboxImage} resizeMode="contain" />
              <TouchableOpacity style={styles.lightboxClose} onPress={() => setShowLightbox(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* ── Sign-in modal ── */}
      <Modal visible={showSignIn} transparent animationType="fade" onRequestClose={() => setShowSignIn(false)}>
        <TouchableWithoutFeedback onPress={() => setShowSignIn(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Sign in</Text>
                <Text style={styles.modalSubtitle}>Save recipes and create cookbooks. Google is currently supported.</Text>
                <TouchableOpacity style={styles.providerButton} onPress={() => handleSignIn('google')}>
                  <View style={styles.providerLogo}><Text style={styles.googleG}>G</Text></View>
                  <Text style={styles.providerText}>Continue with Google (recommended)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dismissButton} onPress={() => setShowSignIn(false)}>
                  <Text style={styles.dismissText}>Maybe later</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 54 : 22, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.hairline },
  logo: { fontSize: 20, fontWeight: '700', color: t.text, letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { padding: 6 },
  signInChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: t.accent },
  signInChipText: { color: t.accent, fontSize: 13, fontWeight: '600' },

  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  centerContainer: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, minHeight: height - 160, overflow: 'visible' },

  // Input is independently centered; prefs float absolutely to the right on web
  inputAndPrefs: { width: '100%', maxWidth: 560 },
  inputAndPrefsWeb: { position: 'relative', overflow: 'visible' },

  // ── Prompt box ──
  promptBox: { width: '100%', maxWidth: 560, backgroundColor: t.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 6 },
  promptBoxWeb: { justifyContent: 'space-between' },
  input: { fontSize: 16, color: t.text, minHeight: 104, textAlignVertical: 'top', lineHeight: 22 },
  inputWebWide: { flex: 1, minHeight: 0 },

  suggestionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.hairline, marginTop: 4, gap: 6 },
  suggestionGhostText: { flex: 1, fontSize: 14, color: t.muted, lineHeight: 20 },
  suggestionCompletion: { color: t.accent, opacity: 0.7 },
  suggestionHint: { fontSize: 11, color: t.muted, backgroundColor: t.card, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  suggestionLoadingText: { fontSize: 18, color: t.muted, letterSpacing: 4 },

  urlChipWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 8, borderWidth: 1, borderColor: t.border, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 10 },
  urlChipInput: { flex: 1, fontSize: 13, color: t.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginRight: 6 },
  urlError: { fontSize: 11, color: '#cc4444', marginTop: -6, marginBottom: 6, marginLeft: 2 },

  imagePreviewWrapper: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4, minHeight: 88 },
  imageThumbnail: { width: 80, height: 80, borderRadius: 8, backgroundColor: t.border },
  imageZoomBadge: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: 3 },
  imageFileMeta: { flex: 1, gap: 4 },
  imageFileName: { fontSize: 13, color: t.text, fontWeight: '500' },
  imageMime: { fontSize: 11, color: t.muted },
  imageRemoveBtn: { padding: 6 },

  toolbarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.hairline, marginTop: 6 },
  toolbarLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toolbarBtn: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  toolbarBtnActive: { backgroundColor: t.accentFaded },
  generateButton: { backgroundColor: t.accent, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  generateButtonDisabled: { backgroundColor: t.muted, opacity: 0.45 },
  generateButtonText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
  topicErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.hairline, marginTop: 4 },
  topicErrorText: { flex: 1, fontSize: 13, color: '#e53935' },

  refineLink: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingVertical: 4 },
  refineLinkText: { fontSize: 12, color: t.muted },
  helperText: { marginTop: 14, fontSize: 12, color: t.muted, letterSpacing: 0.5, textAlign: 'center' },

  // Preference chips: below input on mobile, absolutely floated right on web
  prefsWrap: { width: '100%', maxWidth: 560, marginTop: 12, gap: 10 },
  prefsWrapWeb: { position: 'absolute', left: 580, top: 0, width: 230, gap: 12 },
  prefsGroup: { gap: 6 },
  prefsGroupLabel: { fontSize: 11, fontWeight: '700', color: t.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  prefsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  prefChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
  prefChipSel: { borderColor: t.accent, backgroundColor: t.accentFaded },
  prefChipText: { fontSize: 13, color: t.subtext },
  prefChipTextSel: { color: t.accent, fontWeight: '600' },

  recentlySavedPill: { flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: t.surface, borderRadius: 20, borderWidth: 1, borderColor: '#4caf50', alignSelf: 'center', maxWidth: 280 },
  recentlySavedText: { fontSize: 13, color: t.text, fontWeight: '500', flex: 1 },

  myRecipesButton: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20, borderWidth: 1, borderColor: t.accent, backgroundColor: t.surface, alignSelf: 'center' },
  myRecipesButtonText: { fontSize: 14, fontWeight: '500', color: t.accent },

  // ── Clarify step (removed — preferences now inline) ──

  // ── Review screen ──
  reviewScreen: { flex: 1, backgroundColor: t.surface, margin: 12, borderRadius: 16, borderWidth: 1.5, borderColor: t.accent, overflow: 'hidden', minHeight: height - 100 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.hairline },
  reviewTitle: { fontSize: 19, fontWeight: '700', color: t.text, flex: 1, marginRight: 10, lineHeight: 25 },
  closeButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.border, justifyContent: 'center', alignItems: 'center' },

  reviewBody: { flex: 1 },
  reviewBodyWeb: { flexDirection: 'row' },

  // Meta
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  metaBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.border },
  metaBadgeText: { fontSize: 12, color: t.subtext, fontWeight: '500' },
  recipeSummary: { fontSize: 13, color: t.muted, lineHeight: 19, marginBottom: 16, fontStyle: 'italic' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: t.muted, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 10 },

  // Ingredients column
  ingColumn: { padding: 16 },
  ingColumnWeb: { width: 300, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: t.hairline },
  ingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  ingBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent, flexShrink: 0, marginTop: 1 },
  ingText: { flex: 1, fontSize: 15, color: t.text, lineHeight: 21 },
  ingTextMarked: { color: t.muted, textDecorationLine: 'line-through' },
  optLabel: { fontSize: 12, color: t.muted },
  ingAction: { padding: 4, borderRadius: 6 },
  ingActionMarked: { backgroundColor: '#cc4444' },

  // Steps column
  stepsColumn: { flex: 1, padding: 16 },
  stepsColumnWeb: { flex: 1 },
  stepCard: { marginBottom: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.card },
  stepCardMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: t.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1 },
  stepNumText: { fontSize: 11, fontWeight: '700', color: t.muted },
  stepText: { flex: 1, fontSize: 14, color: t.text, lineHeight: 21 },
  stepTimer: { marginTop: 6, marginLeft: 34, fontSize: 12, color: t.muted },

  // Fallback
  fallbackScroll: { flex: 1, padding: 16 },
  recipeText: { fontSize: 15, lineHeight: 26, color: t.subtext },

  // ── Apply-changes pane (mark ingredients above, optional context, one apply) ──
  chatBar: { padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.hairline, gap: 10 },
  markedCountText: { fontSize: 12, color: t.muted },
  applyResultBanner: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 12, gap: 8 },
  applyResultText: { fontSize: 14, color: t.text, lineHeight: 20 },
  applyOptionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  applyOptionChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: t.accentFaded },
  applyOptionChipText: { fontSize: 13, color: t.accent, fontWeight: '600' },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: t.border, borderRadius: 10, backgroundColor: t.surface, paddingLeft: 14, paddingRight: 6 },
  chatInput: { flex: 1, fontSize: 14, color: t.text, paddingVertical: 10, lineHeight: 20 },
  actionButtons: { flexDirection: 'row', gap: 10 },
  undoButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: t.border },
  undoButtonDisabled: { opacity: 0.4 },
  undoButtonText: { color: t.subtext, fontSize: 14, fontWeight: '600' },
  undoButtonTextDisabled: { color: t.muted },
  saveButton: { flex: 1.4, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: t.accent },
  saveButtonFull: { paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: t.accent },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
  startOverLink: { alignSelf: 'center', paddingVertical: 4 },
  startOverText: { fontSize: 12, color: t.muted },

  // ── Voice overlay ──
  voiceOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', gap: 24 },
  voiceTitle: { fontSize: 26, fontWeight: '700', color: '#fff', letterSpacing: -0.5 },
  voiceSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.55)', marginTop: -16 },
  soundbarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 64 },
  soundbarBar: { width: 6, height: 48, borderRadius: 3 },
  voiceActions: { flexDirection: 'row', gap: 32 },
  voiceAbortBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  voiceConfirmBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: t.accent, justifyContent: 'center', alignItems: 'center' },
  voiceHint: { fontSize: 12, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.3 },

  // ── Lightbox ──
  lightboxOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  lightboxImage: { width: '100%', height: '85%' },
  lightboxClose: { position: 'absolute', top: Platform.OS === 'ios' ? 58 : 24, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },

  // ── Sign-in modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  modalCard: { width: '100%', maxWidth: 340, backgroundColor: t.card, borderRadius: 20, borderWidth: 1, borderColor: t.border, padding: 28, alignItems: 'center' },
  modalTitle: { fontSize: 22, fontWeight: '700', color: t.text, marginBottom: 6 },
  modalSubtitle: { fontSize: 13, color: t.muted, marginBottom: 28, textAlign: 'center' },
  providerButton: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, marginBottom: 12, gap: 14 },
  providerLogo: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  googleG: { fontSize: 14, fontWeight: '800', color: '#4285F4', lineHeight: 16 },
  providerText: { color: t.subtext, fontSize: 14, fontWeight: '500', flex: 1 },
  dismissButton: { marginTop: 8, paddingVertical: 10 },
  dismissText: { color: t.muted, fontSize: 13 },
});

export default GenerateScreen;
