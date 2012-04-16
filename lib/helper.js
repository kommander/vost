/**
 * Helper
 */
 
/**
 * Merge objects recursively
 */
var mergeObjects = module.exports.mergeObjects = function(obj1, obj2){
  for(k in obj2){
    if(typeof obj2[k] === 'object' && obj2[k] !== null){
      if(!obj1[k]){
        obj1[k] = obj2[k];
      } else {
        if(typeof obj1[k] !== 'object') obj1[k] = {};
        mergeObjects(obj1[k], obj2[k])
      }
    } else {
      obj1[k] = obj2[k];
    }
  }
  return obj1;
}

/**
 * Check if an object has the specified attribute and if it has a value other than null
 */
var isset = module.exports.isset = function(value){
  return typeof value !== 'undefined' && value != null && value != '';
}
