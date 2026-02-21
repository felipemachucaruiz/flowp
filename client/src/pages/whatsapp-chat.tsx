import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { useSubscription } from "@/lib/use-subscription";
import { SUBSCRIPTION_FEATURES } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageCircle,
  Send,
  Search,
  Plus,
  Image as ImageIcon,
  Video,
  FileText,
  Smile,
  Paperclip,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Lock,
  ArrowLeft,
  Music,
  X,
  ShoppingCart,
  Package,
  Loader2,
  Trash2,
  Mic,
  Square,
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/currency";

interface Conversation {
  id: string;
  tenantId: string;
  customerPhone: string;
  customerName: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastInboundAt: string | null;
  unreadCount: number;
  isActive: boolean;
  assignedUserId: number | null;
  createdAt: string;
  updatedAt: string;
}

function isSessionWindowOpen(conversation: Conversation): boolean {
  if (!conversation.lastInboundAt) {
    return false;
  }
  const inboundTime = new Date(conversation.lastInboundAt).getTime();
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return (now - inboundTime) < twentyFourHours;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  tenantId: string;
  direction: "inbound" | "outbound";
  contentType: string;
  body: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
  caption: string | null;
  senderPhone: string | null;
  senderName: string | null;
  providerMessageId: string | null;
  status: string;
  createdAt: string;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "sent":
      return <Check className="w-3 h-3 text-muted-foreground" />;
    case "delivered":
      return <CheckCheck className="w-3 h-3 text-muted-foreground" />;
    case "read":
      return <CheckCheck className="w-3 h-3 text-blue-500" />;
    case "failed":
      return <AlertCircle className="w-3 h-3 text-red-500" />;
    default:
      return <Clock className="w-3 h-3 text-muted-foreground" />;
  }
}

function resolveMediaUrl(url: string, tenantId?: string): string {
  if (url && url.includes("filemanager.gupshup.io")) {
    return `/api/whatsapp/chat/media-proxy?url=${encodeURIComponent(url)}${tenantId ? `&tenantId=${tenantId}` : ""}`;
  }
  if (url && !url.startsWith("/") && url.includes("/objects/")) {
    try {
      const u = new URL(url);
      return u.pathname;
    } catch {}
  }
  return url;
}

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => setError(true));
    }
  }, [isPlaying]);

  const fmtTime = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 min-w-[200px] max-w-[280px] p-1">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={() => {
          if (audioRef.current) setDuration(audioRef.current.duration);
        }}
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
        onError={() => setError(true)}
      />
      {error ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Music className="w-4 h-4" />
          <a href={src} target="_blank" rel="noopener noreferrer" className="underline" data-testid="link-download-audio">
            Download audio
          </a>
        </div>
      ) : (
        <>
          <button
            onClick={togglePlay}
            className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 hover:bg-primary/20 transition-colors"
            data-testid="button-audio-play"
          >
            {isPlaying ? (
              <Square className="w-3 h-3 fill-current" />
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current ml-0.5"><polygon points="5,3 19,12 5,21" /></svg>
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div
              className="h-1.5 bg-muted rounded-full cursor-pointer relative"
              onClick={(e) => {
                if (!audioRef.current || !duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                audioRef.current.currentTime = pct * duration;
              }}
            >
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {fmtTime(currentTime)} / {fmtTime(duration)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      data-testid="lightbox-overlay"
    >
      <button
        className="absolute top-4 right-4 text-white/80 hover:text-white z-50 p-2"
        onClick={onClose}
        data-testid="button-close-lightbox"
      >
        <X className="w-6 h-6" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="lightbox-image"
      />
    </div>
  );
}

function MediaContent({ message, tenantId }: { message: ChatMessage; tenantId?: string }) {
  const { contentType, mediaUrl, mediaFilename, caption, body } = message;
  const [showLightbox, setShowLightbox] = useState(false);

  const proxiedUrl = mediaUrl ? resolveMediaUrl(mediaUrl, tenantId) : "";

  if (contentType === "image" && mediaUrl) {
    return (
      <div>
        <img
          src={proxiedUrl}
          alt={caption || "Image"}
          className="max-w-[240px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => setShowLightbox(true)}
          data-testid="img-chat-image"
        />
        {caption && <p className="mt-1 text-sm">{caption}</p>}
        {showLightbox && (
          <ImageLightbox
            src={proxiedUrl}
            alt={caption || "Image"}
            onClose={() => setShowLightbox(false)}
          />
        )}
      </div>
    );
  }

  if (contentType === "video" && mediaUrl) {
    return (
      <div>
        <video src={proxiedUrl} controls className="max-w-[240px] rounded-lg" />
        {caption && <p className="mt-1 text-sm">{caption}</p>}
      </div>
    );
  }

  if (contentType === "audio" && mediaUrl) {
    return (
      <AudioPlayer src={proxiedUrl} />
    );
  }

  if (contentType === "document" && mediaUrl) {
    return (
      <a href={proxiedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted" data-testid="link-document">
        <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{mediaFilename || "Document"}</p>
          {caption && <p className="text-xs text-muted-foreground truncate">{caption}</p>}
        </div>
      </a>
    );
  }

  if (contentType === "sticker" && mediaUrl) {
    return <img src={proxiedUrl} alt="Sticker" className="w-24 h-24" />;
  }

  if (contentType === "notification") {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px]">AUTO</Badge>
        <p className="text-sm whitespace-pre-wrap">{body}</p>
      </div>
    );
  }

  return <p className="text-sm whitespace-pre-wrap">{body}</p>;
}

function MessageBubble({ message, isGrouped, tenantId }: { message: ChatMessage; isGrouped: boolean; tenantId?: string }) {
  const isOutbound = message.direction === "outbound";
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"} ${isGrouped ? "mt-0.5" : "mt-3"}`} data-testid={`message-bubble-${message.id}`}>
      <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${
        isOutbound 
          ? "bg-primary text-primary-foreground rounded-br-md" 
          : "bg-muted rounded-bl-md"
      }`}>
        {!isGrouped && !isOutbound && message.senderName && (
          <p className="text-xs font-medium mb-1 opacity-70">{message.senderName}</p>
        )}
        {!isGrouped && isOutbound && message.senderName && message.senderName !== "System" && message.senderName !== "Bot" && (
          <p className="text-xs font-medium mb-1 opacity-70">{message.senderName}</p>
        )}
        <MediaContent message={message} tenantId={tenantId} />
        <div className={`flex items-center gap-1 justify-end mt-1 ${isOutbound ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
          <span className="text-[10px]">{time}</span>
          {isOutbound && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppChatPage() {
  const { tenant, user } = useAuth();
  const { t } = useI18n();
  const { hasFeature } = useSubscription();
  const { toast } = useToast();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [newChatDialog, setNewChatDialog] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState("");
  const [newChatName, setNewChatName] = useState("");
  const [newChatMode, setNewChatMode] = useState<"customer" | "manual">("customer");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMobileConversation, setShowMobileConversation] = useState(false);
  const [catalogDialog, setCatalogDialog] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [catalogHeader, setCatalogHeader] = useState("");
  const [catalogBody, setCatalogBody] = useState("");
  const [catalogFooter, setCatalogFooter] = useState("");
  const [productPickerDialog, setProductPickerDialog] = useState(false);
  const [productPickerSearch, setProductPickerSearch] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tenantId = (tenant as any)?.id;
  const hasChat = hasFeature(SUBSCRIPTION_FEATURES.WHATSAPP_CHAT as any);

  const { data: conversationsData, isLoading: loadingConversations } = useQuery<{ conversations: Conversation[]; total: number }>({
    queryKey: ["/api/whatsapp/chat/conversations", searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.set("search", searchTerm);
      const res = await fetch(`/api/whatsapp/chat/conversations?${params}`, {
        headers: { "x-tenant-id": tenantId },
      });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
    enabled: !!tenantId && hasChat,
    refetchInterval: 30000,
  });

  const conversations = conversationsData?.conversations || [];

  interface Customer {
    id: string;
    name: string;
    phone: string | null;
    phoneCountryCode: string | null;
    email: string | null;
  }

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers/search"],
    enabled: !!tenantId && newChatDialog,
  });

  const filteredCustomers = (customers || []).filter(c => {
    if (!c.phone) return false;
    if (!customerSearch) return true;
    const q = customerSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.phone || "").includes(q) || (c.email || "").toLowerCase().includes(q);
  });

  const selectCustomer = (c: Customer) => {
    const phone = c.phoneCountryCode && c.phone ? `+${c.phoneCountryCode}${c.phone}` : c.phone || "";
    setNewChatPhone(phone);
    setNewChatName(c.name);
  };

  interface Product {
    id: string;
    name: string;
    sku: string | null;
    price: string;
    categoryId: string | null;
    image: string | null;
    isActive: boolean;
  }

  interface Category {
    id: string;
    name: string;
  }

  interface WhatsAppConfig {
    configured: boolean;
    catalogId?: string;
    enabled?: boolean;
  }

  const { data: whatsappConfig } = useQuery<WhatsAppConfig>({
    queryKey: ["whatsapp", "config"],
    queryFn: async () => {
      const res = await fetch("/api/whatsapp/config", {
        headers: { "x-tenant-id": tenantId },
      });
      if (!res.ok) throw new Error("Failed to load config");
      return res.json();
    },
    enabled: !!tenantId && hasChat,
  });

  const { data: catalogProducts } = useQuery<Product[]>({
    queryKey: ["/api/products", "catalog"],
    queryFn: async () => {
      const res = await fetch("/api/products", {
        headers: { "x-tenant-id": tenantId },
      });
      if (!res.ok) throw new Error("Failed to load products");
      const data = await res.json();
      return (Array.isArray(data) ? data : data.products || []).filter((p: Product) => p.isActive);
    },
    enabled: !!tenantId && (catalogDialog || productPickerDialog),
  });

  const { data: catalogCategories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    queryFn: async () => {
      const res = await fetch("/api/categories", {
        headers: { "x-tenant-id": tenantId },
      });
      if (!res.ok) throw new Error("Failed to load categories");
      return res.json();
    },
    enabled: !!tenantId && (catalogDialog || productPickerDialog),
  });

  const { data: messages, isLoading: loadingMessages } = useQuery<ChatMessage[]>({
    queryKey: ["/api/whatsapp/chat/conversations", selectedConversation?.id, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/whatsapp/chat/conversations/${selectedConversation!.id}/messages?limit=100`, {
        headers: { "x-tenant-id": tenantId },
      });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!tenantId && !!selectedConversation,
    refetchInterval: 10000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      await apiRequest("POST", `/api/whatsapp/chat/conversations/${conversationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chat/conversations"] });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { conversationId: string; contentType: string; body?: string; mediaUrl?: string; mediaMimeType?: string; mediaFilename?: string; caption?: string }) => {
      const res = await apiRequest("POST", "/api/whatsapp/chat/send", {
        ...data,
        senderName: user?.name || user?.username || "Staff",
      });
      return res.json();
    },
    onSuccess: () => {
      setMessageInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chat/conversations", selectedConversation?.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chat/conversations"] });
    },
    onError: (err: any) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const sendCatalogMutation = useMutation({
    mutationFn: async (data: { conversationId: string; productIds: string[]; headerText: string; bodyText: string; footerText: string }) => {
      const res = await apiRequest("POST", "/api/whatsapp/chat/send-catalog", {
        ...data,
        senderName: user?.name || user?.username || "Staff",
      });
      return res.json();
    },
    onSuccess: () => {
      setCatalogDialog(false);
      setSelectedProductIds([]);
      setCatalogHeader("");
      setCatalogBody("");
      setCatalogFooter("");
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chat/conversations", selectedConversation?.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chat/conversations"] });
      toast({ title: t("common.success"), description: t("whatsapp_chat.catalog_sent" as any) || "Product catalog sent!" });
    },
    onError: (err: any) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const newConversationMutation = useMutation({
    mutationFn: async (data: { customerPhone: string; customerName?: string }) => {
      const res = await apiRequest("POST", "/api/whatsapp/chat/new-conversation", data);
      return res.json();
    },
    onSuccess: (data) => {
      setNewChatDialog(false);
      setNewChatPhone("");
      setNewChatName("");
      setSelectedConversation(data);
      setShowMobileConversation(true);
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chat/conversations"] });
    },
    onError: (err: any) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const { data: greetingStatus } = useQuery<{ configured: boolean; approved: boolean; templateName: string | null }>({
    queryKey: ["/api/whatsapp/chat/greeting-status"],
    queryFn: async () => {
      const res = await fetch("/api/whatsapp/chat/greeting-status", {
        headers: { "x-tenant-id": tenantId },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && hasChat,
    staleTime: 60000,
  });

  const sendGreetingMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await apiRequest("POST", "/api/whatsapp/chat/send-greeting", {
        conversationId,
        senderName: user?.name || user?.username || "Staff",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chat/conversations", selectedConversation?.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chat/conversations"] });
      toast({ title: t("whatsapp_chat.greeting_sent" as any) });
    },
    onError: (err: any) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      await apiRequest("DELETE", `/api/whatsapp/chat/conversations/${conversationId}`);
    },
    onSuccess: () => {
      setSelectedConversation(null);
      setShowMobileConversation(false);
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chat/conversations"] });
      toast({ title: t("whatsapp_chat.chat_deleted" as any) });
    },
    onError: (err: any) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (selectedConversation && conversations.length > 0) {
      const updated = conversations.find(c => c.id === selectedConversation.id);
      if (updated) {
        const changed = updated.lastInboundAt !== selectedConversation.lastInboundAt ||
          updated.lastMessageAt !== selectedConversation.lastMessageAt ||
          updated.unreadCount !== selectedConversation.unreadCount;
        if (changed) {
          setSelectedConversation(updated);
        }
      }
    }
  }, [conversations]);

  const sessionOpen = selectedConversation ? isSessionWindowOpen(selectedConversation) : false;

  useEffect(() => {
    if (selectedConversation?.unreadCount && selectedConversation.unreadCount > 0) {
      markReadMutation.mutate(selectedConversation.id);
    }
  }, [selectedConversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!tenantId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", tenantId }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "whatsapp_message") {
          if (data.conversationId === selectedConversation?.id && data.message) {
            queryClient.setQueryData(
              ["/api/whatsapp/chat/conversations", selectedConversation.id, "messages"],
              (old: ChatMessage[] | undefined) => old ? [...old, data.message] : [data.message]
            );
          }
          queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chat/conversations"] });
        }
        if (data.type === "whatsapp_status" && data.conversationId === selectedConversation?.id) {
          queryClient.setQueryData(
            ["/api/whatsapp/chat/conversations", selectedConversation.id, "messages"],
            (old: ChatMessage[] | undefined) => {
              if (!old) return old;
              return old.map(msg =>
                msg.providerMessageId === data.providerMessageId || msg.id === data.messageId
                  ? { ...msg, status: data.status }
                  : msg
              );
            }
          );
        }
      } catch {}
    };

    return () => {
      ws.close();
    };
  }, [tenantId, selectedConversation?.id]);

  const handleSend = () => {
    if (!messageInput.trim() || !selectedConversation) return;
    sendMessageMutation.mutate({
      conversationId: selectedConversation.id,
      contentType: "text",
      body: messageInput.trim(),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const WA_LIMITS = {
    image: 5 * 1024 * 1024,
    video: 16 * 1024 * 1024,
    audio: 16 * 1024 * 1024,
    document: 100 * 1024 * 1024,
  };

  const compressImage = (file: File, maxSizeBytes: number): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let quality = 0.85;
        let maxDim = 2048;
        if (file.size > maxSizeBytes * 2) {
          quality = 0.6;
          maxDim = 1600;
        } else if (file.size > maxSizeBytes) {
          quality = 0.7;
          maxDim = 1920;
        }
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Compression failed"));
            const compressed = new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
            resolve(compressed);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
      img.src = url;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConversation) return;

    const ABSOLUTE_MAX = 100 * 1024 * 1024;
    if (file.size > ABSOLUTE_MAX) {
      toast({ title: t("common.error"), description: t("whatsapp_chat.file_over_100mb" as any) || "Files larger than 100MB cannot be sent via WhatsApp", variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    let contentType: "image" | "video" | "audio" | "document" = "document";
    if (file.type.startsWith("image/")) contentType = "image";
    else if (file.type.startsWith("video/")) contentType = "video";
    else if (file.type.startsWith("audio/")) contentType = "audio";

    const maxSize = WA_LIMITS[contentType];
    let fileToUpload = file;

    if (file.size > maxSize && contentType === "image") {
      try {
        toast({ title: t("whatsapp_chat.compressing_image" as any) || "Compressing image..." });
        fileToUpload = await compressImage(file, maxSize);
        if (fileToUpload.size > maxSize) {
          const limitMB = Math.round(maxSize / (1024 * 1024));
          toast({ title: t("common.error"), description: `${t("whatsapp_chat.file_too_large" as any) || "File too large"}. Max: ${limitMB}MB`, variant: "destructive" });
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
      } catch {
        toast({ title: t("common.error"), description: t("whatsapp_chat.upload_failed"), variant: "destructive" });
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    } else if (file.size > maxSize) {
      const limitMB = Math.round(maxSize / (1024 * 1024));
      toast({ title: t("common.error"), description: `${t("whatsapp_chat.file_too_large" as any) || "File too large"}. Max: ${limitMB}MB`, variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("file", fileToUpload);

    try {
      const res = await fetch("/api/upload/media", {
        method: "POST",
        headers: { "x-tenant-id": tenantId },
        body: formData,
      });

      if (!res.ok) {
        toast({ title: t("common.error"), description: t("whatsapp_chat.upload_failed"), variant: "destructive" });
        return;
      }

      const { url } = await res.json();

      sendMessageMutation.mutate({
        conversationId: selectedConversation.id,
        contentType,
        mediaUrl: url,
        mediaMimeType: fileToUpload.type,
        mediaFilename: fileToUpload.name,
        caption: "",
      });
    } catch {
      toast({ title: t("common.error"), description: t("whatsapp_chat.upload_failed"), variant: "destructive" });
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startRecording = async () => {
    if (!selectedConversation) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        setRecordingDuration(0);

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size < 500) return;

        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        const file = new File([audioBlob], `voice-note.${ext}`, { type: mimeType });
        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch("/api/upload/media", {
            method: "POST",
            headers: { "x-tenant-id": tenantId },
            body: formData,
          });
          if (!res.ok) {
            toast({ title: t("common.error"), description: t("whatsapp_chat.upload_failed"), variant: "destructive" });
            return;
          }
          const uploadResult = await res.json();
          sendMessageMutation.mutate({
            conversationId: selectedConversation!.id,
            contentType: "audio",
            mediaUrl: uploadResult.url,
            mediaMimeType: uploadResult.contentType || mimeType,
            mediaFilename: uploadResult.filename || file.name,
            caption: "",
          });
        } catch {
          toast({ title: t("common.error"), description: t("whatsapp_chat.upload_failed"), variant: "destructive" });
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);
    } catch {
      toast({ title: t("common.error"), description: t("whatsapp_chat.mic_permission_denied" as any) || "Microphone access denied", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = () => {
        mediaRecorderRef.current?.stream?.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
  };

  const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return t("whatsapp_chat.yesterday");
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: "short" });
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const getInitials = (name: string | null, phone: string) => {
    if (name) return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    return phone.slice(-2);
  };

  const emojis = ["😀", "😂", "❤️", "👍", "🙏", "🎉", "🔥", "✅", "👋", "💯", "😊", "🤝", "📦", "💰", "🛒", "📋", "✨", "⭐", "🎁", "📱"];

  if (!hasChat) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="whatsapp-chat-locked">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">{t("whatsapp_chat.upgrade_required")}</h2>
            <p className="text-muted-foreground">{t("whatsapp_chat.upgrade_description")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setShowMobileConversation(true);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background" data-testid="whatsapp-chat-page">
      <div className={`w-full md:w-80 lg:w-96 border-r flex flex-col ${showMobileConversation ? "hidden md:flex" : "flex"}`}>
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-500" />
              {t("whatsapp_chat.title")}
            </h2>
            <Button size="icon" variant="ghost" onClick={() => setNewChatDialog(true)} data-testid="button-new-chat">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("whatsapp_chat.search_placeholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9"
              data-testid="input-search-conversations"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loadingConversations ? (
            <div className="p-4 text-center text-muted-foreground">{t("common.loading")}</div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t("whatsapp_chat.no_conversations")}</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                  selectedConversation?.id === conv.id ? "bg-muted" : ""
                }`}
                data-testid={`conversation-item-${conv.id}`}
              >
                <Avatar className="w-10 h-10 flex-shrink-0">
                  <AvatarFallback className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-sm">
                    {getInitials(conv.customerName, conv.customerPhone)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm truncate ${conv.unreadCount > 0 ? "font-bold text-foreground" : "font-medium"}`}>{conv.customerName || conv.customerPhone}</p>
                    <span className={`text-[10px] flex-shrink-0 ${conv.unreadCount > 0 ? "text-green-600 dark:text-green-400 font-semibold" : "text-muted-foreground"}`}>
                      {conv.lastMessageAt && formatTime(conv.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className={`text-xs truncate ${conv.unreadCount > 0 ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{conv.lastMessagePreview || ""}</p>
                    {conv.unreadCount > 0 && (
                      <Badge className="ml-1 bg-green-500 text-white text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
                        {conv.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </div>

      <div className={`flex-1 flex flex-col ${!showMobileConversation ? "hidden md:flex" : "flex"}`}>
        {selectedConversation ? (
          <>
            <div className="flex items-center gap-3 p-3 border-b bg-background">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setShowMobileConversation(false)} data-testid="button-back-conversations">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <Avatar className="w-9 h-9">
                <AvatarFallback className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs">
                  {getInitials(selectedConversation.customerName, selectedConversation.customerPhone)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedConversation.customerName || selectedConversation.customerPhone}</p>
                <p className="text-xs text-muted-foreground">{selectedConversation.customerPhone}</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-delete-conversation">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("whatsapp_chat.delete_chat_title" as any)}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("whatsapp_chat.delete_chat_confirm" as any)}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => deleteConversationMutation.mutate(selectedConversation!.id)}
                      disabled={deleteConversationMutation.isPending}
                      data-testid="button-confirm-delete-conversation"
                    >
                      {deleteConversationMutation.isPending ? t("common.loading") : t("common.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <ScrollArea className="flex-1 p-4">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t("common.loading")}
                </div>
              ) : (
                <div className="space-y-0">
                  {(messages || []).map((msg, i) => {
                    const prev = messages?.[i - 1];
                    const isGrouped = prev?.direction === msg.direction && 
                      (new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 60000;
                    return <MessageBubble key={msg.id} message={msg} isGrouped={isGrouped} tenantId={tenantId} />;
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            <div className="border-t p-2 bg-background relative">
              {!sessionOpen ? (
                <div className="flex flex-col items-center gap-2 py-2" data-testid="session-closed-banner">
                  {(() => {
                    const hasOutboundMessages = (messages || []).some(m => m.direction === "outbound");
                    const hasNoInbound = !selectedConversation?.lastInboundAt;
                    const greetingAlreadySent = hasOutboundMessages && hasNoInbound;
                    
                    if (greetingAlreadySent) {
                      return (
                        <>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{t("whatsapp_chat.waiting_reply" as any)}</span>
                          </div>
                          {greetingStatus?.configured && greetingStatus?.approved && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => sendGreetingMutation.mutate(selectedConversation!.id)}
                              disabled={sendGreetingMutation.isPending}
                              data-testid="button-resend-greeting"
                            >
                              <MessageCircle className="w-4 h-4 mr-2" />
                              {sendGreetingMutation.isPending
                                ? t("common.loading")
                                : t("whatsapp_chat.resend_greeting" as any)}
                            </Button>
                          )}
                        </>
                      );
                    }
                    
                    return (
                      <>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Lock className="w-3.5 h-3.5" />
                          <span>{t("whatsapp_chat.session_closed" as any)}</span>
                        </div>
                        {greetingStatus?.configured && greetingStatus?.approved ? (
                          <Button
                            size="default"
                            onClick={() => sendGreetingMutation.mutate(selectedConversation!.id)}
                            disabled={sendGreetingMutation.isPending}
                            data-testid="button-send-greeting"
                          >
                            <MessageCircle className="w-4 h-4 mr-2" />
                            {sendGreetingMutation.isPending
                              ? t("common.loading")
                              : t("whatsapp_chat.send_greeting" as any)}
                          </Button>
                        ) : (
                          <p className="text-xs text-muted-foreground text-center px-4" data-testid="text-no-greeting-template">
                            {t("whatsapp_chat.no_greeting_configured" as any)}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <>
                  {showEmojiPicker && (
                    <div className="absolute bottom-full left-0 mb-1 bg-popover border rounded-lg shadow-lg p-2 grid grid-cols-10 gap-1 z-50">
                      {emojis.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            setMessageInput(prev => prev + emoji);
                            setShowEmojiPicker(false);
                          }}
                          className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded text-lg"
                          data-testid={`emoji-${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="flex-shrink-0 h-9 w-9" onClick={() => setShowEmojiPicker(!showEmojiPicker)} data-testid="button-emoji-picker">
                      <Smile className="w-5 h-5 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="flex-shrink-0 h-9 w-9" onClick={() => fileInputRef.current?.click()} data-testid="button-attach-file">
                      <Paperclip className="w-5 h-5 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0 h-9 w-9"
                      onClick={() => setProductPickerDialog(true)}
                      title={t("whatsapp_chat.send_product_info" as any) || "Send Product Info"}
                      data-testid="button-send-product-info"
                    >
                      <Package className="w-5 h-5 text-muted-foreground" />
                    </Button>
                    {whatsappConfig?.catalogId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0 h-9 w-9"
                        onClick={() => setCatalogDialog(true)}
                        title={t("whatsapp_chat.send_catalog" as any) || "Send Product Catalog"}
                        data-testid="button-send-catalog"
                      >
                        <ShoppingCart className="w-5 h-5 text-muted-foreground" />
                      </Button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                      onChange={handleFileUpload}
                      data-testid="input-file-upload"
                    />
                    {isRecording ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0 h-9 w-9 text-red-500 hover:text-red-600"
                          onClick={cancelRecording}
                          data-testid="button-cancel-recording"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <div className="flex-1 flex items-center gap-2 px-3">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-sm font-medium text-red-500">{formatRecordingTime(recordingDuration)}</span>
                        </div>
                        <Button
                          size="icon"
                          className="flex-shrink-0 h-9 w-9 bg-green-500 hover:bg-green-600"
                          onClick={stopRecording}
                          data-testid="button-stop-recording"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Input
                          placeholder={t("whatsapp_chat.type_message")}
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          onKeyDown={handleKeyDown}
                          className="flex-1 h-9"
                          data-testid="input-message"
                        />
                        {messageInput.trim() ? (
                          <Button
                            size="icon"
                            className="flex-shrink-0 h-9 w-9 bg-green-500 hover:bg-green-600"
                            onClick={handleSend}
                            disabled={sendMessageMutation.isPending}
                            data-testid="button-send-message"
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            className="flex-shrink-0 h-9 w-9 bg-green-500 hover:bg-green-600"
                            onClick={startRecording}
                            data-testid="button-start-recording"
                          >
                            <Mic className="w-4 h-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <h3 className="text-lg font-medium mb-1">{t("whatsapp_chat.select_conversation")}</h3>
              <p className="text-sm">{t("whatsapp_chat.select_description")}</p>
            </div>
          </div>
        )}
      </div>

      <Dialog open={newChatDialog} onOpenChange={(open) => {
        setNewChatDialog(open);
        if (!open) {
          setNewChatPhone("");
          setNewChatName("");
          setCustomerSearch("");
          setNewChatMode("customer");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("whatsapp_chat.new_conversation")}</DialogTitle>
            <DialogDescription>{t("whatsapp_chat.new_conversation_desc")}</DialogDescription>
          </DialogHeader>

          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            <button
              className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${newChatMode === "customer" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setNewChatMode("customer")}
              data-testid="tab-select-customer"
            >
              {t("whatsapp_chat.from_customers")}
            </button>
            <button
              className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${newChatMode === "manual" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setNewChatMode("manual")}
              data-testid="tab-manual-phone"
            >
              {t("whatsapp_chat.manual_entry")}
            </button>
          </div>

          {newChatMode === "customer" ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t("whatsapp_chat.search_customers")}
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="pl-9 h-9"
                  data-testid="input-search-customers"
                />
              </div>
              <ScrollArea className="h-[220px] border rounded-lg">
                {filteredCustomers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {t("whatsapp_chat.no_customers_with_phone")}
                  </div>
                ) : (
                  filteredCustomers.map((c) => {
                    const fullPhone = c.phoneCountryCode && c.phone ? `+${c.phoneCountryCode}${c.phone}` : c.phone || "";
                    const isSelected = newChatPhone === fullPhone && newChatName === c.name;
                    return (
                      <div
                        key={c.id}
                        onClick={() => selectCustomer(c)}
                        className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/50 transition-colors border-b last:border-0 ${isSelected ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
                        data-testid={`customer-option-${c.id}`}
                      >
                        <Avatar className="w-8 h-8 flex-shrink-0">
                          <AvatarFallback className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                            {c.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{fullPhone}</p>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                      </div>
                    );
                  })
                )}
              </ScrollArea>
              {newChatPhone && (
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-sm">
                  <Check className="w-4 h-4 text-green-500" />
                  <span className="font-medium truncate">{newChatName}</span>
                  <span className="text-muted-foreground">{newChatPhone}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>{t("whatsapp_chat.phone_number")}</Label>
                <Input
                  placeholder="+573001234567"
                  value={newChatPhone}
                  onChange={(e) => setNewChatPhone(e.target.value)}
                  data-testid="input-new-chat-phone"
                />
              </div>
              <div>
                <Label>{t("whatsapp_chat.customer_name")}</Label>
                <Input
                  placeholder={t("whatsapp_chat.customer_name_placeholder")}
                  value={newChatName}
                  onChange={(e) => setNewChatName(e.target.value)}
                  data-testid="input-new-chat-name"
                />
              </div>
            </div>
          )}

          <Button
            className="w-full"
            onClick={() => newConversationMutation.mutate({ customerPhone: newChatPhone, customerName: newChatName || undefined })}
            disabled={!newChatPhone.trim() || newConversationMutation.isPending}
            data-testid="button-start-conversation"
          >
            {t("whatsapp_chat.start_chat")}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={productPickerDialog} onOpenChange={(open) => {
        setProductPickerDialog(open);
        if (!open) setProductPickerSearch("");
      }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col" data-testid="dialog-product-picker">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {t("whatsapp_chat.send_product_info" as any) || "Send Product Info"}
            </DialogTitle>
            <DialogDescription>
              {t("whatsapp_chat.product_picker_description" as any) || "Select a product to send its details to this conversation."}
            </DialogDescription>
          </DialogHeader>

          <Input
            placeholder={t("whatsapp_chat.search_products" as any) || "Search products..."}
            value={productPickerSearch}
            onChange={(e) => setProductPickerSearch(e.target.value)}
            className="h-9"
            data-testid="input-product-picker-search"
          />

          <ScrollArea className="flex-1 border rounded-lg min-h-0" style={{ maxHeight: "400px" }}>
            <div className="p-2 space-y-1">
              {(() => {
                const prods = (catalogProducts || []).filter(p => {
                  if (!productPickerSearch) return true;
                  const q = productPickerSearch.toLowerCase();
                  return p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q);
                });
                const cats = catalogCategories || [];
                const catMap = Object.fromEntries(cats.map(c => [c.id, c.name]));
                const grouped: Record<string, typeof prods> = {};
                prods.forEach(p => {
                  const catName = p.categoryId && catMap[p.categoryId] ? catMap[p.categoryId] : (t("whatsapp_chat.uncategorized" as any) || "Uncategorized");
                  if (!grouped[catName]) grouped[catName] = [];
                  grouped[catName].push(p);
                });

                if (prods.length === 0) {
                  return (
                    <div className="text-center text-sm text-muted-foreground py-8">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>{t("whatsapp_chat.no_products" as any) || "No products found"}</p>
                    </div>
                  );
                }

                return Object.entries(grouped).map(([catName, products]) => (
                  <div key={catName} className="mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">{catName}</p>
                    {products.map(product => (
                      <button
                        key={product.id}
                        onClick={() => {
                          if (!selectedConversation) return;
                          const currency = (tenant as any)?.currency || "COP";
                          const price = formatCurrency(parseFloat(product.price), currency);
                          const productText = `*${product.name}*\n${price}${product.description ? `\n${product.description}` : ""}${product.sku ? `\nSKU: ${product.sku}` : ""}`;

                          const mutationPayload = product.image
                            ? { conversationId: selectedConversation.id, contentType: "image", mediaUrl: product.image, caption: productText }
                            : { conversationId: selectedConversation.id, contentType: "text", body: productText };

                          sendMessageMutation.mutate(mutationPayload, {
                            onSuccess: () => {
                              toast({ title: t("whatsapp_chat.product_sent" as any) || "Product info sent" });
                            },
                          });
                          setProductPickerDialog(false);
                          setProductPickerSearch("");
                        }}
                        disabled={sendMessageMutation.isPending}
                        className="w-full flex items-center gap-3 p-2 rounded-md transition-colors text-left"
                        data-testid={`product-picker-item-${product.id}`}
                      >
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                            <Package className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{product.name}</p>
                          {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm font-medium text-muted-foreground">
                            {formatCurrency(parseFloat(product.price), (tenant as any)?.currency || "COP")}
                          </span>
                          <Send className="w-3.5 h-3.5 text-green-500" />
                        </div>
                      </button>
                    ))}
                  </div>
                ));
              })()}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={catalogDialog} onOpenChange={(open) => {
        setCatalogDialog(open);
        if (!open) {
          setSelectedProductIds([]);
          setCatalogHeader("");
          setCatalogBody("");
          setCatalogFooter("");
        }
      }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              {t("whatsapp_chat.send_catalog" as any) || "Send Product Catalog"}
            </DialogTitle>
            <DialogDescription>
              {t("whatsapp_chat.catalog_description" as any) || "Select up to 30 products to send as an interactive catalog message."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="space-y-2">
              <Label>{t("whatsapp_chat.catalog_header" as any) || "Header"}</Label>
              <Input
                value={catalogHeader}
                onChange={(e) => setCatalogHeader(e.target.value)}
                placeholder={t("whatsapp_chat.catalog_header_placeholder" as any) || "Our Products"}
                data-testid="input-catalog-header"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("whatsapp_chat.catalog_body_text" as any) || "Message"}</Label>
              <Input
                value={catalogBody}
                onChange={(e) => setCatalogBody(e.target.value)}
                placeholder={t("whatsapp_chat.catalog_body_placeholder" as any) || "Check out our selection!"}
                data-testid="input-catalog-body"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>{t("whatsapp_chat.select_products" as any) || "Select Products"}</Label>
              <Badge variant="outline" data-testid="badge-product-count">
                {selectedProductIds.length}/30
              </Badge>
            </div>

            <ScrollArea className="flex-1 border rounded-lg min-h-0" style={{ maxHeight: "300px" }}>
              <div className="p-2 space-y-1">
                {(() => {
                  const prods = catalogProducts || [];
                  const cats = catalogCategories || [];
                  const catMap = Object.fromEntries(cats.map(c => [c.id, c.name]));
                  const grouped: Record<string, Product[]> = {};
                  prods.forEach(p => {
                    const catName = p.categoryId && catMap[p.categoryId] ? catMap[p.categoryId] : (t("whatsapp_chat.uncategorized" as any) || "Uncategorized");
                    if (!grouped[catName]) grouped[catName] = [];
                    grouped[catName].push(p);
                  });

                  if (prods.length === 0) {
                    return (
                      <div className="text-center text-sm text-muted-foreground py-8">
                        {t("whatsapp_chat.no_products" as any) || "No active products found"}
                      </div>
                    );
                  }

                  return Object.entries(grouped).map(([catName, products]) => (
                    <div key={catName} className="mb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">{catName}</p>
                      {products.map(product => {
                        const isSelected = selectedProductIds.includes(product.id);
                        return (
                          <div
                            key={product.id}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedProductIds(prev => prev.filter(id => id !== product.id));
                              } else if (selectedProductIds.length < 30) {
                                setSelectedProductIds(prev => [...prev, product.id]);
                              }
                            }}
                            className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${isSelected ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted/50"}`}
                            data-testid={`catalog-product-${product.id}`}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => {}}
                              className="pointer-events-none"
                            />
                            {product.image ? (
                              <img src={product.image} alt={product.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                <Package className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{product.name}</p>
                              {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
                            </div>
                            <span className="text-sm font-medium text-muted-foreground flex-shrink-0">
                              ${parseFloat(product.price).toLocaleString()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            </ScrollArea>

            <Button
              className="w-full"
              onClick={() => {
                if (!selectedConversation) return;
                sendCatalogMutation.mutate({
                  conversationId: selectedConversation.id,
                  productIds: selectedProductIds,
                  headerText: catalogHeader,
                  bodyText: catalogBody,
                  footerText: catalogFooter,
                });
              }}
              disabled={selectedProductIds.length === 0 || sendCatalogMutation.isPending}
              data-testid="button-send-catalog-confirm"
            >
              {sendCatalogMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  {t("whatsapp_chat.send_catalog_button" as any) || `Send ${selectedProductIds.length} Product${selectedProductIds.length !== 1 ? "s" : ""}`}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
