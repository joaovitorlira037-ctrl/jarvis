export type CoreState =
  | "idle"
  | "listening"
  | "processing"
  | "generating"
  | "speaking"
  | "executing"
  | "error";
export type Connection = "missing" | "configured" | "verified";
export interface Status {
  groq: { status: Connection; model: string };
  fish: { status: Connection; model: string; voice_id: string };
  desktop: { configured: boolean; enabled: boolean };
  telemetry_source: string;
  authenticated: boolean;
}
export interface Telemetry {
  source: string;
  cpu_percent: number;
  cpu_count: number;
  memory_percent: number;
  memory_used: number;
  memory_total: number;
  disk_percent: number;
  disk_free: number;
  disk_total: number;
  network_sent: number;
  network_received: number;
  battery_percent: number | null;
  gpu_percent: number | null;
  temperature_c: number | null;
  uptime_seconds: number;
  platform: string;
  timestamp: number;
}
export interface Preferences {
  assistant_name: string;
  preferred_name: string;
  language: "auto" | "pt-BR" | "en-US";
  formality: "polite" | "casual" | "formal";
  speech_enabled: boolean;
  speech_speed: number;
  animation: "full" | "reduced";
  accent: "cyan" | "blue" | "amber";
  save_history: boolean;
  wake_enabled: boolean;
  wake_phrase: string;
  input_device: string;
  output_device: string;
  desktop_enabled: boolean;
  tools_enabled: boolean;
}
export interface Task {
  id: string;
  title: string;
  due_at: string | null;
  done: boolean;
  created_at: string;
}
export interface Memory {
  id: string;
  content: string;
  category: "note" | "preference";
  created_at: string;
}
export interface Activity {
  id: string;
  action: string;
  status: string;
  detail: string;
  created_at: string;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  partial?: boolean;
}
export interface Approval {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status?: string;
  message?: string;
}
