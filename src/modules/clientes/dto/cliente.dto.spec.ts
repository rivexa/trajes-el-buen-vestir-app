import { ValidationArguments } from 'class-validator';
import { ValidarIdentificacionEcuatoriana } from './cliente.dto';

describe('ValidarIdentificacionEcuatoriana', () => {
    const validator = new ValidarIdentificacionEcuatoriana();
    const args = {} as ValidationArguments;

    it('acepta un RUC de sociedad pública con establecimiento 0001', () => {
        expect(validator.validate('1760001550001', args)).toBe(true);
    });

    it('rechaza un RUC público cuyo establecimiento no es 0001', () => {
        expect(validator.validate('1760001550002', args)).toBe(false);
    });

    it('rechaza un RUC público con dígito verificador incorrecto', () => {
        expect(validator.validate('1760001560001', args)).toBe(false);
    });
});
