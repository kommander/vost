/**
 * Helper
 */
 
/**
 * Formats a number with lapsed seconds to a string
 *
 * @param {Integer} seconds The time lapsed in seconds to be formated
 * @return {String} "[%i years][%i months][%i days][%i hours][%i minutes] %i seconds"
 */
var formatLapsed = module.exports.formatLapsed = function(seconds){
  var str = '';
  var interval = Math.floor(seconds / 31536000);
  if (interval >= 1) {
      str += interval + " years ";
      seconds = seconds % 31536000;
  }
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) {
      str += interval + " months ";
      seconds = seconds % 2592000;
  }
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) {
      str += interval + " days ";
      seconds = seconds % 86400;
  }
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) {
      str += interval + " hours ";
      seconds = seconds % 3600;
  }
  interval = Math.floor(seconds / 60);
  if (interval >= 1) {
      str += interval + " minutes ";
      seconds = seconds % 60;
  }
  return str += Math.floor(seconds) + " seconds";
};

/**
 * Merge objects recursively
 */
var mergeObjects = module.exports.mergeObjects = function(obj1, obj2){
  for(k in obj2){
    if(typeof obj2[k] === 'object' && obj2[k] !== null){
      if(!obj1[k]){
        obj1[k] = obj2[k];
      } else {
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
