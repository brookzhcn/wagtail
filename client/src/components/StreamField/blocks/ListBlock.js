/* eslint-disable no-underscore-dangle */

import { BaseSequenceChild, BaseInsertionControl } from './BaseSequenceBlock';
import { escapeHtml as h } from '../../../utils/text';

/* global $ */

export class ListBlockValidationError {
  constructor(blockErrors) {
    this.blockErrors = blockErrors;
  }
}

class ListChild extends BaseSequenceChild {
  /*
  wrapper for an item inside a ListBlock
  */
  getState() {
    return this.block.getState();
  }

  getValue() {
    return this.block.getValue();
  }
}

class InsertPosition extends BaseInsertionControl {
  /*
  Represents a position in the DOM where a new list item can be inserted.

  This renders a + button. Later, these could also be used to represent drop zones for drag+drop reordering.
  */
  constructor(placeholder, opts) {
    super(placeholder, opts);
    this.onRequestInsert = opts && opts.onRequestInsert;

    const button = $(`
      <button type="button" title="${h(opts.strings.ADD)}" data-streamfield-list-add
          class="c-sf-add-button c-sf-add-button--visible">
        <i aria-hidden="true">+</i>
      </button>
    `);
    $(placeholder).replaceWith(button);
    this.element = button.get(0);

    button.click(() => {
      if (this.onRequestInsert) {
        this.onRequestInsert(this.index);
      }
    });
  }
}

export class ListBlock {
  constructor(blockDef, placeholder, prefix, initialState, initialError) {
    this.blockDef = blockDef;
    this.type = blockDef.name;
    this.prefix = prefix;

    const dom = $(`
      <div class="c-sf-container ${h(this.blockDef.meta.classname || '')}">
        <input type="hidden" name="${h(prefix)}-count" data-streamfield-list-count value="0">

        <div data-streamfield-list-container></div>
      </div>
    `);
    $(placeholder).replaceWith(dom);
    if (this.blockDef.meta.helpText) {
      // help text is left unescaped as per Django conventions
      $(`
        <span>
          <div class="help">
            ${this.blockDef.meta.helpIcon}
            ${this.blockDef.meta.helpText}
          </div>
        </span>
      `).insertBefore(dom);
    }

    this.children = [];
    this.inserters = [];
    this.blockCounter = 0;
    this.countInput = dom.find('[data-streamfield-list-count]');
    this.listContainer = dom.find('[data-streamfield-list-container]');
    this.setState(initialState || []);

    if (initialError) {
      this.setError(initialError);
    }
  }

  clear() {
    this.countInput.val(0);
    this.listContainer.empty();
    this.children = [];
    this.blockCounter = 0;

    // Create initial insert position
    const placeholder = document.createElement('div');
    this.listContainer.append(placeholder);
    this.inserters = [
      this._createInsertionControl(
        placeholder, {
          index: 0,
          onRequestInsert: (newIndex, opts) => {
            this._onRequestInsert(newIndex, opts);
          },
          strings: this.blockDef.meta.strings,
        }
      )
    ];
  }

  _getChildDataForInsertion() {
    /* Called when an 'insert new block' action is triggered: given a dict of data from the insertion control,
    return the block definition and initial state to be used for the new block.
    For a ListBlock, no data is passed from the insertion control, as there is a single fixed child block definition.
    */
    const blockDef = this.blockDef.childBlockDef;
    const initialState = this.blockDef.initialChildState;
    return [blockDef, initialState];
  }

  _onRequestInsert(index, opts) {
    /* handler for an 'insert new block' action */
    const [blockDef, initialState] = this._getChildDataForInsertion(opts);
    const newChild = this._insert(blockDef, initialState, null, index, { animate: true });
    newChild.focus();
  }

  _createChild(blockDef, placeholder, prefix, index, id, initialState, opts) {
    return new ListChild(blockDef, placeholder, prefix, index, id, initialState, opts);
  }

  _createInsertionControl(placeholder, opts) {
    return new InsertPosition(placeholder, opts);
  }

  insert(value, index, opts) {
    return this._insert(this.blockDef.childBlockDef, value, null, index, opts);
  }

  _insert(childBlockDef, initialState, id, index, opts) {
    const prefix = this.prefix + '-' + this.blockCounter;
    const animate = opts && opts.animate;
    this.blockCounter++;

    /*
    a new insert position and block will be inserted AFTER the insert position with the given index;
    e.g if there are 3 blocks the children of listContainer will be
    [insert pos 0, block 0, insert pos 1, block 1, insert pos 2, block 2, insert pos 3]
    and inserting a new block at index 1 will create a new block 1 and insert position 2 after the
    current menu 1, and increment everything after that point
    */
    const existingInsertPositionElement = this.inserters[index].element;
    const blockPlaceholder = document.createElement('div');
    const inserterPlaceholder = document.createElement('div');
    $(blockPlaceholder).insertAfter(existingInsertPositionElement);
    $(inserterPlaceholder).insertAfter(blockPlaceholder);

    /* shuffle up indexes of all blocks / insert positions above this index */
    for (let i = index; i < this.children.length; i++) {
      this.children[i].setIndex(i + 1);
    }
    for (let i = index + 1; i < this.inserters.length; i++) {
      this.inserters[i].setIndex(i + 1);
    }

    const child = this._createChild(childBlockDef, blockPlaceholder, prefix, index, id, initialState, {
      animate,
      onRequestDuplicate: (i) => { this.duplicateBlock(i); },
      onRequestDelete: (i) => { this.deleteBlock(i); },
      onRequestMoveUp: (i) => { this.moveBlock(i, i - 1); },
      onRequestMoveDown: (i) => { this.moveBlock(i, i + 1); },
      strings: this.blockDef.meta.strings,
    });
    this.children.splice(index, 0, child);

    const inserter = this._createInsertionControl(
      inserterPlaceholder, {
        index: index + 1,
        onRequestInsert: (newIndex, inserterOpts) => {
          this._onRequestInsert(newIndex, inserterOpts);
        },
        strings: this.blockDef.meta.strings,
      }
    );
    this.inserters.splice(index + 1, 0, inserter);

    this.countInput.val(this.blockCounter);

    const isFirstChild = (index === 0);
    const isLastChild = (index === this.children.length - 1);
    if (!isFirstChild) {
      child.enableMoveUp();
      if (isLastChild) {
        /* previous child (which was previously the last one) can now move down */
        this.children[index - 1].enableMoveDown();
      }
    }
    if (!isLastChild) {
      child.enableMoveDown();
      if (isFirstChild) {
        /* next child (which was previously the first one) can now move up */
        this.children[index + 1].enableMoveUp();
      }
    }
  }

  duplicateBlock(index) {
    const childState = this.children[index].getState();
    this.insert(childState, index + 1, { animate: true });
    this.children[index + 1].focus();
  }

  deleteBlock(index) {
    this.children[index].markDeleted({ animate: true });
    this.inserters[index].delete();
    this.children.splice(index, 1);
    this.inserters.splice(index, 1);

    /* index numbers of children / insert positions above this index now need updating to match
    their array indexes */
    for (let i = index; i < this.children.length; i++) {
      this.children[i].setIndex(i);
    }
    for (let i = index; i < this.inserters.length; i++) {
      this.inserters[i].setIndex(i);
    }

    if (index === 0 && this.children.length > 0) {
      /* we have removed the first child; the new first child cannot be moved up */
      this.children[0].disableMoveUp();
    }
    if (index === this.children.length && this.children.length > 0) {
      /* we have removed the last child; the new last child cannot be moved down */
      this.children[this.children.length - 1].disableMoveDown();
    }
  }

  moveBlock(oldIndex, newIndex) {
    if (oldIndex === newIndex) return;
    const inserterToMove = this.inserters[oldIndex];
    const childToMove = this.children[oldIndex];

    /* move HTML elements */
    if (newIndex > oldIndex) {
      $(inserterToMove.element).insertAfter(this.children[newIndex].element);
    } else {
      $(inserterToMove.element).insertBefore(this.inserters[newIndex].element);
    }
    $(childToMove.element).insertAfter(inserterToMove.element);

    /* reorder items in the `insert positions` and `children` arrays */
    this.inserters.splice(oldIndex, 1);
    this.inserters.splice(newIndex, 0, inserterToMove);
    this.children.splice(oldIndex, 1);
    this.children.splice(newIndex, 0, childToMove);

    /* update index properties of moved items */
    if (newIndex > oldIndex) {
      for (let i = oldIndex; i <= newIndex; i++) {
        this.inserters[i].setIndex(i);
        this.children[i].setIndex(i);
      }
    } else {
      for (let i = newIndex; i <= oldIndex; i++) {
        this.inserters[i].setIndex(i);
        this.children[i].setIndex(i);
      }
    }

    /* enable/disable up/down arrows as required */
    const maxIndex = this.children.length - 1;
    if (oldIndex === 0) {
      childToMove.enableMoveUp();
      this.children[0].disableMoveUp();
    }
    if (oldIndex === maxIndex) {
      childToMove.enableMoveDown();
      this.children[maxIndex].disableMoveDown();
    }
    if (newIndex === 0) {
      childToMove.disableMoveUp();
      this.children[1].enableMoveUp();
    }
    if (newIndex === maxIndex) {
      childToMove.disableMoveDown();
      this.children[maxIndex - 1].enableMoveDown();
    }
  }

  setState(values) {
    this.clear();
    values.forEach(val => {
      this.insert(val, this.children.length);
    });
  }

  setError(errorList) {
    if (errorList.length !== 1) {
      return;
    }
    const error = errorList[0];

    // eslint-disable-next-line no-restricted-syntax
    for (const blockIndex in error.blockErrors) {
      if (error.blockErrors.hasOwnProperty(blockIndex)) {
        this.children[blockIndex].setError(error.blockErrors[blockIndex]);
      }
    }
  }

  getState() {
    return this.children.map(child => child.getState());
  }

  getValue() {
    return this.children.map(child => child.getValue());
  }

  focus() {
    if (this.children.length) {
      this.children[0].focus();
    }
  }
}

export class ListBlockDefinition {
  constructor(name, childBlockDef, initialChildState, meta) {
    this.name = name;
    this.childBlockDef = childBlockDef;
    this.initialChildState = initialChildState;
    this.meta = meta;
  }

  render(placeholder, prefix, initialState, initialError) {
    return new ListBlock(this, placeholder, prefix, initialState, initialError);
  }
}
