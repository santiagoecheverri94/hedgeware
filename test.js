var addon = require('bindings')('deephedge');

const obj = {
    field1: "f1",
    field2: "f2"
};
addon.ModifyObject(obj);

console.log(obj);
console.log('');

function NodeFuncToBeCalledFromCpp(stringArg, numArg) {
    console.log(`I'm a Node function called from C++ with stringArg:"${stringArg}" and numArg:<${numArg}>`);
}

addon.CallJSFunction(NodeFuncToBeCalledFromCpp);
console.log('');
