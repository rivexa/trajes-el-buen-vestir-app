import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { WhatsAppClient } from './whatsapp.client';

jest.mock('axios');
const axiosPost = axios.post as jest.MockedFunction<typeof axios.post>;

describe('WhatsAppClient (Evolution)', () => {
    const config = {
        get: jest.fn((key: string) => {
            const mapa: Record<string, string> = {
                EVOLUTION_API_URL: 'https://evolution.local',
                EVOLUTION_API_KEY: 'key',
                EVOLUTION_INSTANCE: 'buen-vestir',
            };
            return mapa[key];
        }),
    } as unknown as ConfigService;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('omite el envío si falta configuración', async () => {
        const sinConfig = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
        const client = new WhatsAppClient(sinConfig);
        const r = await client.enviarTexto({ telefonoE164: '593987654321', texto: 'Hola' });
        expect(r.omitido).toBe(true);
        expect(axiosPost).not.toHaveBeenCalled();
    });

    it('envía texto por Evolution', async () => {
        axiosPost.mockResolvedValue({ data: { key: { id: 'ev.1' } } });
        const client = new WhatsAppClient(config);
        const r = await client.enviarTexto({ telefonoE164: '593987654321', texto: 'Pedido listo' });
        expect(r.ok).toBe(true);
        expect(r.messageId).toBe('ev.1');
        expect(axiosPost).toHaveBeenCalledWith(
            'https://evolution.local/message/sendText/buen-vestir',
            { number: '593987654321', text: 'Pedido listo' },
            expect.objectContaining({ headers: expect.objectContaining({ apikey: 'key' }) }),
        );
    });
});
