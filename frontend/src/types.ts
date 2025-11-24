export type MessageStatus = 'DELIVERED' | 'FAILED' | 'UNDELIVERED' | 'QUEUED' | 'SENT';

export type MessageDirection = 'MT' | 'MO'; // Mobile Terminated (Outbound), Mobile Originated (Inbound)

export interface LogEntry {
  id: string;
  timestamp: string; // ISO string
  from: string;
  to: string;
  carrier?: string;
  status: MessageStatus;
  errorCode?: string;
  latency?: number; // ms
  type: 'SMS' | 'MMS';
  direction: MessageDirection;
  cost: number;
}

export interface TimeSeriesPoint {
  time: string;
  throughput: number;
  latency: number;
  errors: number;
}

export interface ErrorCluster {
  code: string;
  description: string;
  count: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface CarrierStat {
  name: string;
  deliveryRate: number;
  latencyAvg: number;
  volume: number;
  status: 'operational' | 'degraded' | 'outage';
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
  active: boolean;
}

