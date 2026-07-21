import {
  Zap,
  ClipboardCheck,
  RefreshCw,
  Receipt,
  Settings as SettingsGear,
  LogOut,
  Menu,
  Check,
  Download,
  Info,
  Shield,
  ArrowRight,
  Sparkles,
  QrCode,
  AlertCircle,
  ChevronDown,
  Eye,
  EyeOff,
  Copy,
  Search,
  SlidersHorizontal,
  FileUp,
  ClipboardPaste,
  Keyboard,
  X,
  Loader2,
  Send,
  Ban,
  Clock,
  Plus,
  Wifi,
  WifiOff,
  Wallet,
  ExternalLink,
  ArrowDownLeft,
  Pencil,
  Trash2,
} from "lucide-react";

// Sidebar/nav uses Material-Symbols-style string names so call sites read
// declaratively (<Icon name="settings" />); this maps those names onto real
// lucide-react components, which are tree-shaken SVGs instead of a webfont.
const ICONS = {
  bolt: Zap,
  fact_check: ClipboardCheck,
  sync: RefreshCw,
  receipt_long: Receipt,
  settings: SettingsGear,
  logout: LogOut,
  menu: Menu,
  check: Check,
  download: Download,
  info: Info,
  shield: Shield,
  arrow_forward: ArrowRight,
  auto_awesome: Sparkles,
  qr_code_2: QrCode,
  error: AlertCircle,
  expand_more: ChevronDown,
  visibility: Eye,
  visibility_off: EyeOff,
  content_copy: Copy,
  search: Search,
  tune: SlidersHorizontal,
  upload_file: FileUp,
  content_paste: ClipboardPaste,
  keyboard: Keyboard,
  close: X,
  loader: Loader2,
  send: Send,
  ban: Ban,
  clock: Clock,
  plus: Plus,
  wifi: Wifi,
  wifi_off: WifiOff,
  wallet: Wallet,
  open_in_new: ExternalLink,
  deposit: ArrowDownLeft,
  edit: Pencil,
  trash: Trash2,
};

/**
 * `size` is a number of px (defaults to 20, matching the sidebar's old
 * font-size). `fill` mimics the Material Symbols "filled" variant by
 * switching the icon to a solid currentColor fill with no stroke.
 */
export default function Icon({ name, className = "", style, fill = false, size = 20 }) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  return (
    <Cmp
      size={size}
      strokeWidth={fill ? 0 : 1.75}
      fill={fill ? "currentColor" : "none"}
      className={`inline-block align-middle shrink-0 ${className}`}
      style={style}
    />
  );
}
