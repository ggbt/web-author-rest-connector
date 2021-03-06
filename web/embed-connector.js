(function() {
  // run this code only when embeded.
  if(true != workspace.embedded) {
    return;
  }

  Actions = {
    SET_READ_ONLY_STATUS: 'setReadOnly',
    INITIALIZE: 'initialize'
  };

  /**
   * The Embedded connector.
   *
   * @constructor
   */
  EmbeddedConnector = function() {
    // listen for post messages
    window.addEventListener('message', this.messageReceived.bind(this), false);



    // handle track changes.
    var frame = window.frameElement;
    if(workspace.embedded && frame) {
      if (frame.getAttribute('data-track') == "true") {
        this.forceChangeTracking = true;
      }
    }

    goog.events.listen(workspace, sync.api.Workspace.EventType.BEFORE_EDITOR_LOADED,
      this.beforeEditorLoadedListener.bind(this));

    goog.events.listen(workspace, sync.api.Workspace.EventType.EDITOR_LOADED,
      function() {
        this.editorLoaded = true;
      }.bind(this));

    this.saveCallbacks = [];
  }

  /**
   * Handler method for the BEFORE_EDITOR_LOADED event.
   *
   * @param event the event.
   */
  EmbeddedConnector.prototype.beforeEditorLoadedListener = function(event) {
    this.editor = event.editor;

    // mark track changes ON serverside.
    event.options.trackChanges = this.forceChangeTracking;

    // remove the ToggleChangeTracking action from the toolbar.
    goog.events.listen(event.editor, sync.api.Editor.EventTypes.ACTIONS_LOADED,
      this.actionsLoadedListener.bind(this, event.editor));
  };

  /**
   * Handler method for the ACTIONS_LOADED event.
   *
   * @param e the event.
   */
  EmbeddedConnector.prototype.actionsLoadedListener = function(editor, e) {
    if (e.actionsConfiguration && e.actionsConfiguration.toolbars && e.actionsConfiguration.toolbars[0].name == "Review") {
      var actions = e.actionsConfiguration.toolbars[0].children;
      var i;
      var action;

      if(this.forceChangeTracking) {
        for (i = 0; i < actions.length; i ++) {
          action = actions[i];
          if (action.type == 'action' && action.id == 'Author/TrackChanges') {
            actions.splice(i, 1);
          }
        }
        // remove the Toggle track changes action.
        editor.getActionsManager().unregisterAction('Author/TrackChanges');
      }
    }
    // replace the save action with one that offers hooks for before and after save.
    setTimeout(function() {
      if(!this.replacedSave) {
        this.replacedSave = true;
        let saveAction = editor.getActionsManager().getActionById("Author/Save");
        let oldActionPerformed = saveAction.actionPerformed.bind(saveAction);

        saveAction.actionPerformed = function(callback) {
          oldActionPerformed(function() {
            let i;
            for(i = 0; i < this.saveCallbacks.length; i++) {
              this.saveCallbacks[i]();
            }
            callback();
          }.bind(this));
        }.bind(this);
      }
    }.bind(this), 0);
  };

  /**
   * Add a method that is called after the save action was invoked.
   *
   * @param {function} listener
   */
  EmbeddedConnector.prototype.addSaveListener = function(listener) {
    this.saveCallbacks.push(listener);
  };

  /**
   * Remove a save listener.
   *
   * @param {function} listener
   */
  EmbeddedConnector.prototype.removeSaveListener = function(listener) {
    for(let i = 0; i < this.saveCallbacks.length; i++) {
      if(this.saveCallbacks[i] == listener) {
        this.saveCallbacks.splice(i, 1);
      }
    }
  };

  /**
   * Function that handles all the messages received from the embeding library.
   *
   * @param e the message received message.
   */
  EmbeddedConnector.prototype.messageReceived = function(e) {
    var message = e.data;
    var action = message.action;
    var params = message.params;

    switch (action) {
      case Actions.SET_READ_ONLY_STATUS:
        this.setReadOnlyStatus(params);

        break;
      case Actions.INITIALIZE:
        // initialize only once.
        this.initialize(params);

        break;
    }
  };

  /**
   * Sets the readonly status based on the received parameters.
   *
   * @param params the parameters object that determines the readonly status.
   */
  EmbeddedConnector.prototype.setReadOnlyStatus = function(params) {
    if(this.editorLoaded) {
      var newValue = params.readOnly;
      var reason = params.reason || '';
      var op = new sync.ops.ServerOperation('ro.sync.ecss.extensions.commons.operations.SetReadOnlyStatusOperation',
        workspace.currentEditor.controller);

      op.doOperation(function(e) {
        },
        {
          "read-only": newValue,
          reason: reason
        }, null);
    } else {
      goog.events.listen(workspace, sync.api.Workspace.EventType.EDITOR_LOADED,
        this.setReadOnlyStatus.bind(this, params));
    }
  };

  /**
   * Initialize the WebAuthor based on the options passed by the embedding app.
   *
   * @param params init params.
   */
  EmbeddedConnector.prototype.initialize = function(params) {
    if( !this.initialized) {
      this.initialized = true;

      if (params.forceTrackChanges) {
        this.forceTrackChanges();
      }

      // notify the callback frame the editor initialized.
      this.postToCallbackFrame({
        action: 'initialized'
      });
    }
  };

  /**
   * Post the message to the callback iframe.
   *
   * @param message the message to post to the iframe.
   */
  EmbeddedConnector.prototype.postToCallbackFrame = function(message) {
    var siblingFrames = window.top.frames
    var i;
    for (i = 0; i < siblingFrames.length; i ++) {
      // do not post messages to self.
      var frameName = null;
      try {
        frameName = siblingFrames[i].name;
      } catch (err) {}

      if (frameName != 'WebAuthor-frame') {
        siblingFrames[i].postMessage(message, '*');
      }
    }
  };

  /**
   * Removes the toggleChangeTracking toolbar action and
   * enables change tracking.
   */
  EmbeddedConnector.prototype.forceTrackChanges = function() {
    goog.events.listen(workspace, sync.api.Workspace.EventType.BEFORE_EDITOR_LOADED, function(event) {
      // mark track changes ON serverside.
      event.options.trackChanges = "true";

      // remove the ToggleChangeTracking action from the toolbar.
      goog.events.listen(event.editor, sync.api.Editor.EventTypes.ACTIONS_LOADED, function(e) {
        if (e.actionsConfiguration && e.actionsConfiguration.toolbars && e.actionsConfiguration.toolbars[0].name == "Review") {
          var actions = e.actionsConfiguration.toolbars[0].children;
          let i;
          let action;
          for (i = 0; i < actions.length; i ++) {
            action = actions[i];
            if (action.type == 'action' && action.id == 'Author/TrackChanges') {
              actions.splice(i, 1);
            }
          }
          // remove the Toggle track changes action.
          event.editor.getActionsManager()
            .unregisterAction('Author/TrackChanges');
        }
      });
    });
  };

  /**
   * Removes the ShowXML action from the toolbar and action manager.
   */
  EmbeddedConnector.prototype.removeShowXMLAction = function() {
    goog.events.listen(workspace, sync.api.Workspace.EventType.BEFORE_EDITOR_LOADED, function(event) {
      // remove the ToggleChangeTracking action from the toolbar.
      goog.events.listen(event.editor, sync.api.Editor.EventTypes.ACTIONS_LOADED, function(e) {
        if(e.actionsConfiguration && e.actionsConfiguration.toolbars && e.actionsConfiguration.toolbars[0].name == "Review") {
          var children = e.actionsConfiguration.toolbars[0].children;
          let i;
          for(i = 0; i < children.length; i++) {
            let child = children[i];
            if(child.name == 'More...') {
              let moreChildren = child.children;
              let moreChild;
              let j;
              for(j = 0; j < moreChildren.length; j++) {
                moreChild = moreChildren[j];
                if(moreChild.id == 'Author/ShowXML') {
                  // remove the ShoXML action.
                  children.splice(j, 1);
                  break;
                }
              }
              break;
            }
          }
        }
      });
    });
  }

  // Load the embedded custom CSS.
  sync.util.loadCSSFile("../plugin-resources/rest-resources/embedded.css");

  // Initialize the connector.
  window.EmbeddedConnector = new EmbeddedConnector();

})();