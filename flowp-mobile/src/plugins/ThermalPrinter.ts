import { BleClient, numberToUUID } from '@capacitor-community/bluetooth-le';

// ESC/POS Commands
const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

// Common thermal printer service UUIDs
const PRINTER_SERVICE_UUIDS = [
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Generic printer service
  '000018f0-0000-1000-8000-00805f9b34fb', // Star printers
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Epson printers
];

const PRINTER_CHAR_UUID = '49535343-8841-43f4-a8d4-ecbe34729bb3';

export interface PrinterDevice {
  deviceId: string;
  name: string;
}

export class ThermalPrinter {
  private connectedDevice: string | null = null;
  private serviceUUID: string | null = null;
  private characteristicUUID: string = PRINTER_CHAR_UUID;

  async initialize(): Promise<void> {
    await BleClient.initialize();
  }

  async scanForPrinters(timeout: number = 10000): Promise<PrinterDevice[]> {
    const devices: PrinterDevice[] = [];
    
    await BleClient.requestLEScan(
      { services: PRINTER_SERVICE_UUIDS },
      (result) => {
        if (result.device.name) {
          devices.push({
            deviceId: result.device.deviceId,
            name: result.device.name
          });
        }
      }
    );

    await new Promise(resolve => setTimeout(resolve, timeout));
    await BleClient.stopLEScan();
    
    return devices;
  }

  async connect(deviceId: string): Promise<boolean> {
    try {
      await BleClient.connect(deviceId, (disconnectedDeviceId) => {
        console.log('Printer disconnected:', disconnectedDeviceId);
        this.connectedDevice = null;
      });

      // Find the printer service
      const services = await BleClient.getServices(deviceId);
      for (const service of services) {
        if (PRINTER_SERVICE_UUIDS.includes(service.uuid)) {
          this.serviceUUID = service.uuid;
          break;
        }
      }

      if (!this.serviceUUID) {
        throw new Error('No compatible printer service found');
      }

      this.connectedDevice = deviceId;
      return true;
    } catch (error) {
      console.error('Failed to connect to printer:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connectedDevice) {
      await BleClient.disconnect(this.connectedDevice);
      this.connectedDevice = null;
    }
  }

  async printText(text: string): Promise<void> {
    if (!this.connectedDevice || !this.serviceUUID) {
      throw new Error('Printer not connected');
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(text + '\n');
    
    await this.writeData(new Uint8Array(data));
  }

  async printReceipt(receipt: ReceiptData): Promise<void> {
    if (!this.connectedDevice || !this.serviceUUID) {
      throw new Error('Printer not connected');
    }

    const commands: number[] = [];

    // Initialize printer
    commands.push(ESC, 0x40); // ESC @

    // Center alignment for header
    commands.push(ESC, 0x61, 0x01); // ESC a 1

    // Bold on for store name
    commands.push(ESC, 0x45, 0x01); // ESC E 1
    this.addText(commands, receipt.storeName);
    commands.push(ESC, 0x45, 0x00); // ESC E 0 - Bold off

    // Store info
    if (receipt.storeAddress) {
      this.addText(commands, receipt.storeAddress);
    }
    if (receipt.storePhone) {
      this.addText(commands, receipt.storePhone);
    }

    // Left alignment for items
    commands.push(ESC, 0x61, 0x00); // ESC a 0

    // Separator
    this.addText(commands, '--------------------------------');

    // Date and order number
    this.addText(commands, `Date: ${receipt.date}`);
    this.addText(commands, `Order: #${receipt.orderNumber}`);
    if (receipt.cashier) {
      this.addText(commands, `Cashier: ${receipt.cashier}`);
    }

    this.addText(commands, '--------------------------------');

    // Items
    for (const item of receipt.items) {
      const qty = item.quantity.toString().padEnd(4);
      const name = item.name.substring(0, 20).padEnd(20);
      const price = item.total.toFixed(2).padStart(8);
      this.addText(commands, `${qty}${name}${price}`);
    }

    this.addText(commands, '--------------------------------');

    // Totals - right aligned
    commands.push(ESC, 0x61, 0x02); // ESC a 2

    this.addText(commands, `Subtotal: ${receipt.subtotal.toFixed(2)}`);
    if (receipt.tax > 0) {
      this.addText(commands, `Tax: ${receipt.tax.toFixed(2)}`);
    }
    if (receipt.discount > 0) {
      this.addText(commands, `Discount: -${receipt.discount.toFixed(2)}`);
    }

    // Bold total
    commands.push(ESC, 0x45, 0x01);
    this.addText(commands, `TOTAL: ${receipt.total.toFixed(2)}`);
    commands.push(ESC, 0x45, 0x00);

    // Payment info
    commands.push(ESC, 0x61, 0x00);
    this.addText(commands, '--------------------------------');
    this.addText(commands, `Payment: ${receipt.paymentMethod}`);
    if (receipt.amountPaid) {
      this.addText(commands, `Paid: ${receipt.amountPaid.toFixed(2)}`);
    }
    if (receipt.change && receipt.change > 0) {
      this.addText(commands, `Change: ${receipt.change.toFixed(2)}`);
    }

    // Footer
    commands.push(ESC, 0x61, 0x01);
    this.addText(commands, '');
    if (receipt.footerMessage) {
      this.addText(commands, receipt.footerMessage);
    }
    this.addText(commands, 'Thank you for your purchase!');
    this.addText(commands, '');

    // Cut paper (partial cut)
    commands.push(GS, 0x56, 0x41, 0x03); // GS V A 3

    // Open cash drawer (if connected)
    commands.push(ESC, 0x70, 0x00, 0x19, 0xFA); // ESC p 0 25 250

    await this.writeData(new Uint8Array(commands));
  }

  private addText(commands: number[], text: string): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    commands.push(...bytes, LF);
  }

  private async writeData(data: Uint8Array): Promise<void> {
    if (!this.connectedDevice || !this.serviceUUID) {
      throw new Error('Printer not connected');
    }

    // Send in chunks of 20 bytes (BLE limit)
    const chunkSize = 20;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      await BleClient.write(
        this.connectedDevice,
        this.serviceUUID,
        this.characteristicUUID,
        new DataView(chunk.buffer)
      );
      // Small delay between chunks
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  async openCashDrawer(): Promise<void> {
    if (!this.connectedDevice || !this.serviceUUID) {
      throw new Error('Printer not connected');
    }

    const commands = new Uint8Array([ESC, 0x70, 0x00, 0x19, 0xFA]);
    await this.writeData(commands);
  }

  isConnected(): boolean {
    return this.connectedDevice !== null;
  }
}

export interface ReceiptData {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  date: string;
  orderNumber: string;
  cashier?: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: string;
  amountPaid?: number;
  change?: number;
  footerMessage?: string;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export default new ThermalPrinter();
