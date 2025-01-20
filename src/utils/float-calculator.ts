import {create, all, MathCollection} from 'mathjs';

const math = create(all, {
    precision: 64,
    epsilon: 1e-60,
});

export const FloatCalculator = {
    add(input1: number, input2: number): number {
        return math.number(math.add(math.bignumber(input1), math.bignumber(input2)));
    },

    multiply(input1: number, input2: number): number {
        return math.number(
            math.multiply(math.bignumber(input1) as any, math.bignumber(input2) as any),
        );
    },

    subtract(input1: number, input2: number): number {
        return math.number(
            math.subtract(math.bignumber(input1), math.bignumber(input2)),
        );
    },

    divide(input1: number, input2: number): number {
        return math.number(
            math.divide(math.bignumber(input1) as any, math.bignumber(input2) as any),
        );
    },

    gt(input1: number, input2: number): number {
        const result = math.compare(math.bignumber(input1), math.bignumber(input2));
        return math.number(result as Exclude<typeof result, MathCollection>) === 1 ?
            1 :
            0;
    },

    gte(input1: number, input2: number): number {
        let result = math.compare(math.bignumber(input1), math.bignumber(input2));
        result = math.number(result as Exclude<typeof result, MathCollection>);
        return result === 1 || result === 0 ? 1 : 0;
    },

    lt(input1: number, input2: number): number {
        const result = math.compare(math.bignumber(input1), math.bignumber(input2));
        return math.number(result as Exclude<typeof result, MathCollection>) === -1 ?
            1 :
            0;
    },

    lte(input1: number, input2: number): number {
        let result = math.compare(math.bignumber(input1), math.bignumber(input2));
        result = math.number(result as Exclude<typeof result, MathCollection>);
        return result === -1 || result === 0 ? 1 : 0;
    },

    eq(input1: number, input2: number): number {
        const result = math.compare(math.bignumber(input1), math.bignumber(input2));
        return math.number(result as Exclude<typeof result, MathCollection>) === 0 ?
            1 :
            0;
    },

    roundToNumDecimalPlaces(input1: number, input2: number): number {
        return math.round(input1, input2);
    },
};
