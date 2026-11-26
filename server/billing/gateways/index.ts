import type { GatewayId } from '../../../shared/billing.js';
import { customGateway } from './custom.js';
import { manualGateway } from './manual.js';
import { pay2sGateway } from './pay2s.js';
import { payosGateway } from './payos.js';
import { sepayGateway } from './sepay.js';
import type { Gateway } from './types.js';

/** Danh sách cổng thanh toán đã cài — thêm cổng mới: thêm 1 dòng ở đây */
export const GATEWAY_IMPLS: Record<GatewayId, Gateway> = {
  payos: payosGateway,
  sepay: sepayGateway,
  pay2s: pay2sGateway,
  custom: customGateway,
  manual: manualGateway,
};

export const gatewayOf = (id: string): Gateway | null =>
  Object.prototype.hasOwnProperty.call(GATEWAY_IMPLS, id) ? GATEWAY_IMPLS[id as GatewayId] : null;

export { GatewayError, type IncomingTx } from './types.js';
