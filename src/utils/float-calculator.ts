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
  equal = 'equal'
}

export function doFloatCalculation(operation: FloatCalculations, float1: number, float2: number): number {
  const calculator: {[operation in FloatCalculations]: () => number} = {
    [FloatCalculations.add]: () => {
      return math.number(math.add(math.bignumber(float1), math.bignumber(float2)));
    },
    [FloatCalculations.subtract]: () => {
      return math.number(math.subtract(math.bignumber(float1), math.bignumber(float2)));
    },
    [FloatCalculations.greaterThan]: () => {
      const result = math.compare(math.bignumber(float1), math.bignumber(float2));
      return math.number(result as Exclude<typeof result, MathCollection>) === 1 ? 1 : 0;
    },
    [FloatCalculations.lessThan]: () => {
      const result = math.compare(math.bignumber(float1), math.bignumber(float2));
      return math.number(result as Exclude<typeof result, MathCollection>) === -1 ? 1 : 0;
    },
    [FloatCalculations.equal]: () => {
      const result = math.compare(math.bignumber(float1), math.bignumber(float2));
      return math.number(result as Exclude<typeof result, MathCollection>) === 0 ? 1 : 0;
    },
  };

  return calculator[operation]();
}
