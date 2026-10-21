import { ValidationArguments } from 'class-validator';
import { ValidarIdentificacionEcuatoriana } from './identificacion-ecuatoriana.validator';

describe('ValidarIdentificacionEcuatoriana', () => {
    const validator = new ValidarIdentificacionEcuatoriana();
    const args = {} as ValidationArguments;

    describe('sociedad pública', () => {
        it('acepta un RUC con establecimiento 0001', () => {
            expect(validator.validate('1760001550001', args)).toBe(true);
        });

        it('acepta un RUC con establecimiento 0002', () => {
            expect(validator.validate('1760001550002', args)).toBe(true);
        });

        it('rechaza un RUC con establecimiento 0000', () => {
            expect(validator.validate('1760001550000', args)).toBe(false);
        });

        it('rechaza un RUC con dígito verificador incorrecto', () => {
            expect(validator.validate('1760001560001', args)).toBe(false);
        });
    });

    describe('persona natural', () => {
        it('acepta una cédula de provincia 30', () => {
            expect(validator.validate('3012345678', args)).toBe(true);
        });

        it('acepta un RUC con establecimiento 002', () => {
            expect(validator.validate('3012345678002', args)).toBe(true);
        });

        it('rechaza un RUC con establecimiento 000', () => {
            expect(validator.validate('3012345678000', args)).toBe(false);
        });
    });

    describe('sociedad privada', () => {
        it('acepta un RUC con establecimiento 002', () => {
            expect(validator.validate('1790012344002', args)).toBe(true);
        });

        it('rechaza un RUC con establecimiento 000', () => {
            expect(validator.validate('1790012344000', args)).toBe(false);
        });
    });

    it('rechaza una identificación de provincia 25', () => {
        expect(validator.validate('2512345678', args)).toBe(false);
    });
});
