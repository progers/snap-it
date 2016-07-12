/**
 * HTML serializer that takes a document and synchronously stores it as an array of strings and stores enough state to later
 * asynchronously convert it into an html text file.
 */
class HTMLSerializer { // TODO: BECAUSE MULTIPLE CONTENT SCRIPTS CAN BE INJECTED, GIVES Identifier 'HTMLSerializer' has already been declared ERROR
                       //       AND IF I ENCAPSULATE THE CLASS IN {} THE TESTS WONT BE ABLE TO INSTANTIATE AN INSTANCE
  constructor() {

    /**
     * @private {Set<string>} Contains the lower case tag names that should be ignored while serializing a document.
     * @const
     */
    this.FILTERED_TAGS = new Set(['script', 'noscript', 'style', 'link']);

    /**
     * @public {Array<string>} This array represents the serialized html that makes up an element or document. 
     */
    this.html = [];

    /**
     * @public {Object<number, string>} The keys represent an index in this.html.  The value
     *    is a url at which the resource that belongs at that index can be retrieved.  The resource will eventually
     *    be converted to a data url.  Because any given document being serialized could be an iframe which is
     *    nested 1 or more levels into the root document, the exact quotes that will be used to surround the data url
     *    must be determined when the frames are being put together, so that they can be properly escaped.  As a
     *    result, this.html has a filler index both immediately before, and immediately after where the data url will
     *    be placed (3 filler indices in total).
     */
    this.srcHoles = {};

    /**
     * @public {Object<number, string>} The keys represent an index in this.html.  The value
     *    is a string that uniquely identifies an iframe, the serialized contents of which should be placed at that
     *    index of this.html.
     */
    this.frameHoles = {};

    /**
     * @public {Array<number>} Each number in this.styleIndices corresponds to an index in this.html at which a
     *    serialized style attribute is located. This is because there are styles that contain quotation marks.
     *    Because any given document being serialized could be an iframe which is nested 1 or more levels into
     *    the root document, the exact quotes that will be used must be determined when the frames are being put
     *    together, so that they can be properly escaped.
     */
    this.styleIndices = [];
  }

  /**
   * Takes an html element, and populates this object's fields such that it can eventually be converted into an
   * html text file.
   *
   * @param {Element} element The Element to serialize
   * @param {number} depth The number of parents this element has in the current frame
   * @private
   */ 
  serializeTree(element, depth) {
    if (!element.tagName && element.nodeType != Node.TEXT_NODE) {
      // ignore elements that don't have tags and are not text
    } else if (element.tagName && this.FILTERED_TAGS.has(element.tagName.toLowerCase())) {
      // filter out elements that are in filteredTags
    } else if (element.nodeType == Node.TEXT_NODE) {
      this.html.push(element.textContent);
    } else {
      this.html.push(new Array(depth+1).join('  '));
      this.html.push(`<${element.tagName.toLowerCase()} `);

      var style = element.ownerDocument.defaultView.getComputedStyle(element, null).cssText;
      this.styleIndices.push(this.html.length);
      this.html.push(`style="${style}" `);

      var attributes = element.attributes;
      if (attributes) {
        for (var i = 0, attribute; attribute = attributes[i]; i++) {
          if (attribute.name.toLowerCase() == 'src') {
            if (element.tagName.toLowerCase() != 'iframe') {
              this.html.push(`${attribute.name}=`);
              this.html.push(''); // entry where properly escaped quotes will go
              this.srcHoles[this.html.length] = attribute.value; // mark location to insert url later
              this.html.push(''); // entry where data url will go
              this.html.push(''); // entry where properly escaped quotes will go
              this.html.push(' ');
            }
          } else if (attribute.name.toLowerCase() != 'style') {
            this.html.push(`${attribute.name}="${attribute.value}" `);
          }
        }
        if (element.tagName.toLowerCase() == 'iframe') { // TODO: IS IT POSSIBLE AN IFRAME CAN HAVE NO ATTRIBUTES?
          this.html.push('srcdoc=');
          this.frameHoles[this.html.length] = this.iframeFullPosition(window) + '.' + this.iframePosition(element.contentWindow);
          this.html.push(''); // entry where the iframe contents will go
          this.html.push(' ');
        }
      }

      this.html.push('>\n');

      var children = element.childNodes;
      if (children) {
        for (var i = 0, child; child = children[i]; i++) {
          this.serializeTree(child, depth+1);
        }
      }

      this.html.push(new Array(depth+1).join('  '));
      this.html.push(`</${element.tagName.toLowerCase()}>\n`);
    }
  }

  /**
   * Takes an html document, and populates this objects fields such that it can eventually be converted into an
   * html file.
   *
   * @param {Document} doc The Document to serialize. Defaults to the current document
   * @public
   */ 
  serializeDocument(doc) {
    doc = doc || document;
    this.html.push('<!DOCTYPE html>\n');
    var node = doc.firstChild;
    while (node.nodeType == Node.DOCUMENT_TYPE_NODE) {
      node = node.nextSibling; // TODO: could this cause an infinite loop?
    }
    this.serializeTree(node, 0);
  }

  /**
   * Computes the index of the window in it's parent's array of frames.
   *
   * @param {Window} win The window to use in the calculation
   * @return {number} the frames index
   */
  iframePosition(win) {
    if (win.parent != win) {
      for (var i = 0; i < win.parent.frames.length; i++) {
        if (win.parent.frames[i] == win) {
          return i;
        }
      }
    } else {
      return -1;
    }
  }

  /**
   * Computes the full path of the frame in the root document.  Nested layers are seperated by '.'
   *
   * @param {Window} win The window to use in the calculation
   * @return {string} The full path
   */
  iframeFullPosition(win) {
    if (this.iframePosition(win) < 0) {
      return '0';
    } else {
      return this.iframeFullPosition(win.parent) + '.' + this.iframePosition(win); 
    }
  }
}
/////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////

/**
 * Takes all of the srcHoles in the HTMLSerializer starting at index i, and creates data
 * urls for the resources, and places them in this.html
 *
 * @param {HTMLSerializer} htmlSerializer The HTMLSerializer
 * @param {number} i The index of this.srcHoles at which to start
 * @param {Function} callback The callback function
 */
function fillSrcHoles(htmlSerializer, i, callback) {
  if (i == Object.keys(htmlSerializer.srcHoles).length) {
    callback(htmlSerializer);
  } else {
    var index = Object.keys(htmlSerializer.srcHoles)[i];
    var src = htmlSerializer.srcHoles[index];
    fetch(src).then(function(response) {
      return response.blob();
      }).then(function(blob) {
      var reader = new FileReader();
      reader.onload = function(e) {
        htmlSerializer.html[index] = e.target.result;
        fillSrcHoles(htmlSerializer, i+1, callback);
      }
      reader.readAsDataURL(blob)
    }).catch(function(error) {
      console.log(error);
      fillSrcHoles(htmlSerializer, i+1, callback);
    });
  }
}

/**
 * Send the neccessary HTMLSerializer properties back to the extension
 *
 * @param {HTMLSerializer} htmlSerializer The HTMLSerializer
 */
function sendHTMLSerializerToExtension(htmlSerializer) {
  var result = {
    'html': htmlSerializer.html,
    'srcHoles': htmlSerializer.srcHoles,
    'frameHoles': htmlSerializer.frameHoles,
    'styleIndices': htmlSerializer.styleIndices,
    'frameIndex': htmlSerializer.iframeFullPosition(window)
  };
  chrome.runtime.sendMessage(result);
}


/////////// TODO: CHECK FOR TEST IN A BETTER WAY /////////////
if (typeof IS_TEST === typeof undefined || !IS_TEST) {
  var htmlSerializer = new HTMLSerializer();
  htmlSerializer.serializeDocument();
  fillSrcHoles(htmlSerializer, 0, sendHTMLSerializerToExtension)
}
