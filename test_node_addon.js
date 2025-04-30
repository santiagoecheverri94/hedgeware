var addon = require('bindings')('deephedge');

function NodeFuncToBeCalledFromCpp(stringArg, numArg) {
    console.log(`I'm a Node function called from C++ with stringArg:"${stringArg}" and numArg:<${numArg}>`);
}

addon.JsTestCallJSFunction(NodeFuncToBeCalledFromCpp);
console.log('');
