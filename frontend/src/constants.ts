import { LogEntry, TimeSeriesPoint, ErrorCluster, CarrierStat, Alert } from './types';

// Carriers
export const CARRIERS = ['Verizon', 'AT&T', 'T-Mobile', 'Vodafone', 'Orange', 'Telefonica', 'China Mobile', 'Jio'];

// Error Codes
export const ERROR_CODES = [
  { code: '30008', desc: 'Unknown Error', severity: 'medium' },
  { code: '30007', desc: 'Carrier Violation', severity: 'high' },
  { code: '30006', desc: 'Landline/Unreachable', severity: 'low' },
  { code: '30005', desc: 'Unknown Destination', severity: 'low' },
  { code: '30003', desc: 'Unreachable', severity: 'medium' },
  { code: '30004', desc: 'Blocked', severity: 'critical' },
];

// Helper to generate random log
export const generateLogEntry = (): LogEntry => {
  const isSuccess = Math.random() > 0.15;
  const status = isSuccess ? 'DELIVERED' : (Math.random() > 0.5 ? 'FAILED' : 'UNDELIVERED');
  const errorObj = !isSuccess ? ERROR_CODES[Math.floor(Math.random() * ERROR_CODES.length)] : undefined;
  
  return {
    id: Math.random().toString(36).substring(7),
    timestamp: new Date().toISOString(),
    from: `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`,
    to: `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`,
    carrier: CARRIERS[Math.floor(Math.random() * CARRIERS.length)],
    status: status as any,
    errorCode: errorObj?.code,
    latency: Math.floor(150 + Math.random() * 600),
    type: Math.random() > 0.9 ? 'MMS' : 'SMS',
    direction: Math.random() > 0.8 ? 'MO' : 'MT',
    cost: 0.0075
  };
};

export const INITIAL_LOGS: LogEntry[] = Array.from({ length: 20 }).map(generateLogEntry);

export const ERROR_CLUSTERS: ErrorCluster[] = [
  { code: '30007', description: 'Carrier Violation', count: 1420, severity: 'high' },
  { code: '30008', description: 'Unknown Error', count: 850, severity: 'medium' },
  { code: '30004', description: 'Message Blocked', count: 320, severity: 'critical' },
  { code: '30003', description: 'Unreachable', count: 210, severity: 'low' },
  { code: '30006', description: 'Landline', count: 150, severity: 'low' },
];

export const CARRIER_STATS: CarrierStat[] = [
  { name: 'Verizon', deliveryRate: 98.2, latencyAvg: 180, volume: 450000, status: 'operational' },
  { name: 'AT&T', deliveryRate: 94.5, latencyAvg: 210, volume: 410000, status: 'degraded' },
  { name: 'T-Mobile', deliveryRate: 99.1, latencyAvg: 150, volume: 380000, status: 'operational' },
  { name: 'Vodafone', deliveryRate: 92.4, latencyAvg: 340, volume: 220000, status: 'degraded' },
  { name: 'Orange', deliveryRate: 96.8, latencyAvg: 280, volume: 190000, status: 'operational' },
];

export const ALERTS: Alert[] = [
  { id: '1', title: 'High Failure Rate: AT&T', description: 'Delivery rate dropped below 95% for 5 consecutive minutes.', severity: 'warning', timestamp: '10 mins ago', active: true },
  { id: '2', title: 'Latency Spike: EU Region', description: 'Average latency > 500ms for outbound traffic.', severity: 'critical', timestamp: '2 mins ago', active: true },
];

