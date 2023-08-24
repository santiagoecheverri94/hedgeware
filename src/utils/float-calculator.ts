import {create, all, MathCollection} from 'mathjs';

const math = create(all, {
  precision: 64,
  epsilon: 1e-60,
});

export enum FloatCalculations {
  add = 'add',
  subtract = 'subtract',
  greaterThan = 'greaterThan',
  lessThan = 'lessThan',
  equal = 'equal',
  roundToNumDecimalPlaces = 'roundToNumDecimalPlaces',
}

export function doFloatCalculation(operation: FloatCalculations, input1: number, input2: number): number {
  const calculator: {[operation in FloatCalculations]: () => number} = {
    [FloatCalculations.add]: () => {
      return math.number(math.add(math.bignumber(input1), math.bignumber(input2)));
    },
    [FloatCalculations.subtract]: () => {
      return math.number(math.subtract(math.bignumber(input1), math.bignumber(input2)));
    },
    [FloatCalculations.greaterThan]: () => {
      const result = math.compare(math.bignumber(input1), math.bignumber(input2));
      return math.number(result as Exclude<typeof result, MathCollection>) === 1 ? 1 : 0;
    },
    [FloatCalculations.lessThan]: () => {
      const result = math.compare(math.bignumber(input1), math.bignumber(input2));
      return math.number(result as Exclude<typeof result, MathCollection>) === -1 ? 1 : 0;
    },
    [FloatCalculations.equal]: () => {
      const result = math.compare(math.bignumber(input1), math.bignumber(input2));
      return math.number(result as Exclude<typeof result, MathCollection>) === 0 ? 1 : 0;
    },
    [FloatCalculations.roundToNumDecimalPlaces]: () => {
      return math.round(input1, input2);
    },
  };

  return calculator[operation]();
}
