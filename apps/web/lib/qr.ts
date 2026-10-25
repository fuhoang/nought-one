import QRCode from 'qrcode';
import { cardUrl } from './site-config';

export async function createCardQr(slug: string): Promise<Buffer> {
  return QRCode.toBuffer(cardUrl(slug), { type: 'png', width: 768, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
}
