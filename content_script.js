/**
 * Send the neccessary HTMLSerializer properties back to the extension.
 *
 * @param {HTMLSerializer} htmlSerializer The HTMLSerializer.
 */
function sendHTMLSerializerToExtension(htmlSerializer) {
  var result = {
    'html': htmlSerializer.html,
    'frameHoles': htmlSerializer.frameHoles,
    'idToStyleIndex': htmlSerializer.idToStyleIndex,
    'idToStyleMap': htmlSerializer.idToStyleMap,
    'windowHeight': htmlSerializer.windowHeight,
    'windowWidth': htmlSerializer.windowWidth,
    'rootId': htmlSerializer.rootId,
    'rootStyleIndex': htmlSerializer.rootStyleIndex,
    'frameIndex': htmlSerializer.iframeFullyQualifiedName(window)
  };
  chrome.runtime.sendMessage(result);
}

var htmlSerializer = new HTMLSerializer();
htmlSerializer.processDocument(document);
htmlSerializer.fillHolesAsync(document, sendHTMLSerializerToExtension);
