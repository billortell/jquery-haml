/* ex:ts=2:et: */
/*jslint bitwise: true, browser: true, eqeqeq: true, evil: true, immed: true, newcap: true, 
    nomen: true, plusplus: true, regexp: true, undef: true, white: true, indent: 2 */
/*globals Showdown, jQuery */

//////////////////////////////////////////
//                                      //
// HAML for JS - DomBuilder for jQuery  //
//                                      //
// Tim Caswell <tim@creationix.com>     //
//                                      //
//////////////////////////////////////////
(function ($) {

  var action_queue = [];

  // Test an object for it's constructor type. Sort of a reverse, discriminatory instanceof
  function isTypeOf(t, c) {
    if (t === undefined) {
      return c === 'undefined';
    }
    if (t === null) {
      return c === 'null';
    }
    return t.constructor.toString().match(new RegExp(c, 'i')) !== null;
  }

  // Parses declarations out of the flat attribute array
  function extractor(attrs, symbol) {
    if (!attrs || !attrs[symbol]) {
      return undefined;
    }
    var extract = attrs[symbol];
    delete attrs[symbol];
    return extract;
  }

  function is_selector(obj) {
    // Must be string of at least 2 length
    if (typeof obj !== "string" || obj.length < 2) {
      return false;
    }
    // Must start with '.', '#', or '%'
    if (! (obj[0] === '.' || obj[0] === '#' || obj[0] === '%')) {
      return false;
    }
    return true;
  }

  // The workhorse that creates the node.
  function exec_haml(node, haml) {

    var css;
    var actions;

    function apply_haml(parent, part) {
      if (isTypeOf(part, 'String') && part.length > 0) {
        // Strip of leading backslash
        if (part[0] === '\\') {
          part = part.substr(1);
        }
        parent.append(document.createTextNode(part));
      }
      if (isTypeOf(part, 'Number')) {
        parent.append(document.createTextNode(part));
      }
      if (isTypeOf(part, 'Array') && part.length > 0) {
        exec_haml(parent, part);
      }
    }

    if (haml.length && haml.length > 0) {
      if (is_selector(haml[0])) {
        // Pull the selector off the front
        // Parse out the selector information
        // Default tag to div if not specified
        var selector = haml.shift(),
        classes = selector.match(/\.[^\.#]+/g),
        ids = selector.match(/#[^\.#]+/g),
        tag = selector.match(/^%([^\.#]+)/g);
        tag = tag ? tag[0].substr(1) : 'div';

        // Create the node
        var newnode = $(document.createElement(tag));
        node.append(newnode);
        node = newnode;

        // Parse the attributes if there are any
        if (haml.length > 0 && isTypeOf(haml[0], 'Object')) {
          var attributes = haml.shift();
          css = extractor(attributes, '_');
          actions = extractor(attributes, '$');
          node.attr(attributes);
        }

        // Add in the ids from the selector
        if (ids) {
          $.each(ids, function () {
            var id = this.substr(1);
            var old_id = node.attr('id');
            if (old_id) {
              node.attr('id', old_id + " " + id);
            }
            else {
              node.attr('id', id);
            }
          });
        }

        // Add in the classes from the selector
        if (classes) {
          $.each(classes, function () {
            node.addClass(this.substr(1));
          });
        }

        // Add in any css from underscore styles        
        if (css) {
          node.css(css);
        }

        // Process jquery actions as well
        if (actions) {
          $.each(actions, function (method) {
            action_queue.push({
              node: node,
              method: method,
              params: this
            });
          });
        }
      }

      // Add in content with recursive call      
      for (var i = 0, l = haml.length; i < l; i += 1) {
        var part = haml[i];
        apply_haml(node, part);
      }
    }
    else {
      apply_haml(node, haml);
    }
  }

  $.haml_parse = function (text, tabsize) {

    // Set up tab character
    var tab = "";
    tabsize = parseInt(tabsize, 10) || 2;
    for (var i; i > 0; i -= 1) {
      tab += " ";
    }

    // Used to tokenize
    var empty_regex = new RegExp("^[ \t]*$"); // Matches empty lines
    var indent_regex = new RegExp("^[ \t]*"); // Matches the indentation
    var selector_regex = new RegExp("^(?:[%][a-z][a-z0-9]*)?(?:[#.][a-z0-9_-]+)*", "i"); // Matches the selector
    var last_indent = 0;

    // Used to parse  
    var haml = [];
    var node = haml;
    var stack = [node];
    var node_indent = 0;
    var indent = 0;

    function parse_push() {
      stack.push(node);
      var new_node = [];
      node.push(new_node);
      node = new_node;
    }

    function parse_pop() {
      node = stack.pop();
      if (!node) {
        throw "Ran out of stack!";
      }
    }

    // Parse the file line by line
    $.each(text.split("\n"), function (line_index, line) {

      // Skip blank lines
      if (line.match(empty_regex)) {
        return;
      }

      // Grab the indentation off the line
      indent = line.match(indent_regex)[0];
      line = line.substr(indent.length);
      indent = indent.replace("\t", tab).length / tabsize;

      // Skip comments
      if (line.charAt(0) === '/') {
        return;
      }

      // Check for outdents
      while (indent < node_indent) {
        node_indent -= 1;
        last_indent = node_indent;
        parse_pop();
      }
      while (indent < last_indent) {
        last_indent -= 1;
        parse_pop();
        node_indent = -1;
      }

      // Check for too much indent
      if (indent > last_indent + 1) {
        throw "Whitespace error: too much indentation";
      }

      // Chek for normal indent
      else if (indent === last_indent + 1) {
        last_indent = indent;
      }

      // Check for a selector.  If there is one, then parse it.
      var selector = line.match(selector_regex);
      if (selector && selector[0].length > 0) {
        selector = selector[0];
        line = line.substr(selector.length);

        if (indent === node_indent) {
          parse_pop();
          parse_push();
        }

        else if (indent > node_indent) {
          parse_push();
          node_indent = indent;
        }
        node.push(selector);
        // Parse the arrribute block using a state machine
        if (line.length > 0 && line.charAt(0) === '{') {
          var l = line.length;
          var count = 1;
          var quote = false;
          var skip = false;
          for (var i = 1; count > 0; i += 1) {

            // If we reach the end of the line, then there is a problem
            if (i > l) {
              throw "Malformed attribute block";
            }

            var c = line.charAt(i);
            if (skip) {
              skip = false;
            } else {
              if (quote) {
                if (c === '\\') {
                  skip = true;
                }
                if (c === quote) {
                  quote = false;
                }
              } else {
                if (c === '"' || c === "'") {
                  quote = c;
                }
                if (c === '{') {
                  count += 1;
                }
                if (c === '}') {
                  count -= 1;
                }
              }
            }
          }
          var block = line.substr(0, i);
          line = line.substr(i);
          eval("block = " + block); // This can be a security warning if running user provided templates
          node.push(block);
        }
        line = line.replace(indent_regex, '');
      }

      // Skip blank lines
      if (!line.match(empty_regex)) {
        node.push(line);
      }

    });
    return haml;
  };

  // Treat the textual content of a node as markdown and convert to html.
  $.fn.markdown = function (data) {
    var markdown = $(this).html();
    var html = $.markdown(markdown, data);
    return this.each(function () {
      $(this).html(html);
    });
  };

  // Converts markdown to html
  // Also supports simple variable replacement
  //
  // NOTE: This requires <http://attacklab.net/showdown/>
  $.markdown = function (markdown, data) {
    var converter = new Showdown.converter();
    var html = converter.makeHtml(markdown);
    if (data) {
      $.each(data, function (k, v) {
        html = html.replace(new RegExp("{" + k + "}", "g"), v);
      });
    }
    return html;
  };

  // Calling haml on a node converts the passed in array to dom children
  $.fn.haml = function (haml, action) {
    action = action || "append";

    // Build the dom on a non-attached node
    var newnode = $(document.createElement("div"));
    exec_haml(newnode, haml);
    
    // Then move it's children to the real location
    this[action].call(this, newnode.children());

    // Flush action queue
    $.each(action_queue, function () {
      // $ is a special case that means onload
      if (this.method === '$') {
        this.apply(this.node, []);
      }
      // otherwise call method on the jquery object with given params.
      else {
        this.node[this.method].apply(this.node, this.params);
      }
    });
    action_queue = [];
    
    return this;
  };

} (jQuery));
