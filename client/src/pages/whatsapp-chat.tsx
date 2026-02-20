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
  Phone,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Lock,
  ArrowLeft,
  Music,
  X,
} from "lucide-react";

interface Conversation {
  id: string;
  tenantId: string;
  customerPhone: string;
  customerName: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
  isActive: boolean;
  assignedUserId: number | null;
  createdAt: string;
  updatedAt: string;
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

function MediaContent({ message }: { message: ChatMessage }) {
  const { contentType, mediaUrl, mediaFilename, caption, body } = message;

  if (contentType === "image" && mediaUrl) {
    return (
      <div>
        <img src={mediaUrl} alt={caption || "Image"} className="max-w-[240px] rounded-lg cursor-pointer" onClick={() => window.open(mediaUrl, "_blank")} />
        {caption && <p className="mt-1 text-sm">{caption}</p>}
      </div>
    );
  }

  if (contentType === "video" && mediaUrl) {
    return (
      <div>
        <video src={mediaUrl} controls className="max-w-[240px] rounded-lg" />
        {caption && <p className="mt-1 text-sm">{caption}</p>}
      </div>
    );
  }

  if (contentType === "audio" && mediaUrl) {
    return <audio src={mediaUrl} controls className="max-w-[240px]" />;
  }

  if (contentType === "document" && mediaUrl) {
    return (
      <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted" data-testid="link-document">
        <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{mediaFilename || "Document"}</p>
          {caption && <p className="text-xs text-muted-foreground truncate">{caption}</p>}
        </div>
      </a>
    );
  }

  if (contentType === "sticker" && mediaUrl) {
    return <img src={mediaUrl} alt="Sticker" className="w-24 h-24" />;
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

function MessageBubble({ message, isGrouped }: { message: ChatMessage; isGrouped: boolean }) {
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
        <MediaContent message={message} />
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

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
          queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chat/conversations"] });
          if (data.conversationId === selectedConversation?.id) {
            queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chat/conversations", selectedConversation?.id, "messages"] });
          }
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConversation) return;

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

      const { url } = await res.json();
      let contentType = "document";
      if (file.type.startsWith("image/")) contentType = "image";
      else if (file.type.startsWith("video/")) contentType = "video";
      else if (file.type.startsWith("audio/")) contentType = "audio";

      sendMessageMutation.mutate({
        conversationId: selectedConversation.id,
        contentType,
        mediaUrl: url,
        mediaMimeType: file.type,
        mediaFilename: file.name,
        caption: "",
      });
    } catch {
      toast({ title: t("common.error"), description: t("whatsapp_chat.upload_failed"), variant: "destructive" });
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
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
                    <p className="text-sm font-medium truncate">{conv.customerName || conv.customerPhone}</p>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {conv.lastMessageAt && formatTime(conv.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground truncate">{conv.lastMessagePreview || ""}</p>
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
              <Button variant="ghost" size="icon" data-testid="button-phone-call">
                <Phone className="w-4 h-4" />
              </Button>
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
                    return <MessageBubble key={msg.id} message={msg} isGrouped={isGrouped} />;
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            <div className="border-t p-2 bg-background relative">
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
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileUpload}
                  data-testid="input-file-upload"
                />
                <Input
                  placeholder={t("whatsapp_chat.type_message")}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 h-9"
                  data-testid="input-message"
                />
                <Button
                  size="icon"
                  className="flex-shrink-0 h-9 w-9 bg-green-500 hover:bg-green-600"
                  onClick={handleSend}
                  disabled={!messageInput.trim() || sendMessageMutation.isPending}
                  data-testid="button-send-message"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
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
    </div>
  );
}
