var DatabaseConnection;

(function () {
var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB;
if (!indexedDB) alert('Your browser does not support indexeddb API!')
var IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction;
var IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange;
var Deferred = jQuery.Deferred; //dependency on jQuery; only jQuery.Deferred

DatabaseConnection = function () {
	this._db = null;
};

DatabaseConnection.prototype.open = function () {
	var self = this;
	var deferred = new Deferred();
	var dbName = "test1", version = 4;

	var reqOpen = indexedDB.open(dbName, version);

	function upgrade (db, newVersion, oldVersion) {
		if (oldVersion < 1) {
			db.createObjectStore('productions', {keyPath: 'id', autoIncrement: false});
			var activityStore = db.createObjectStore('activities', {keyPath: 'id', autoIncrement: false});
			activityStore.createIndex('productionId', 'productionId', {unique: false});
			var docStore = db.createObjectStore('documents', {keyPath: 'id', autoIncrement: false});
			docStore.createIndex('productionId', 'productionId', {unique: false});
		}
	}

	reqOpen.onupgradeneeded = function (e) {
		var db = this.result;
		upgrade(db, e.newVersion, e.oldVersion);
	};

	reqOpen.onsuccess = function (e) {
		var db = this.result;
		
		//for IE10
		if (!!db.setVersion) {
			db.setVersion(version).onsuccess = function (e) {
				upgrade(db, version, db.version);
			};
		}
		self._db = db;
		deferred.resolve();
	};

	reqOpen.onerror = function (err) {
		self._db = null;
		deferred.reject();
	};

	return deferred.promise();
};

DatabaseConnection.prototype.transaction = function (objectStoreNames, mode) {
	return new Transaction(this._db, objectStoreNames, mode);
}

DatabaseConnection.prototype.store = function (name) { //easy API
	var tx = this.transaction([name], 'readwrite');
	return tx.store(name);
}

var Transaction = function (db, objectStoreNames, mode) {
	var tx = db.transaction(objectStoreNames, mode);
	var stores = {};
	jQuery.each(objectStoreNames, function (i, name) {
		stores[name] = new Store(tx, name);
	});
	this._stores = stores;
};

Transaction.prototype.store = function (storeName) {
	return this._stores[storeName];
};

var Store = function(tx, name) {
	this._tx = tx;
	this._name = name;
}

Store.prototype.save = function (data, options) {
	options = options || {};
	var self = this;
	var deferred = new Deferred(function () {this.done(options.success); this.fail(options.error); });
	var tx = self._tx;
	var store = tx.objectStore(self._name);
	var req = store.put(data);
	req.onsuccess = function () {
		deferred.resolve(req.result);
	};
	req.onerror = function () {
		deferred.reject();
	};
	return deferred.promise();
};

Store.prototype.find = function (key, options) {
	options = options || {};
	var self = this;
	var deferred = new Deferred(function () {this.done(options.success); this.fail(options.error); });
	var tx = self._tx;
	var store = tx.objectStore(self._name);
	var req = store.get(key);
	req.onsuccess = function () {
		deferred.resolve(req.result);
	};
	req.onerror = function () {
		deferred.reject();
	};
	return deferred.promise();
};

Store.prototype.all = function (options) {
	options = options || {};
	var self = this;
	var deferred = new Deferred(function () {this.done(options.success); this.fail(options.error); });
	var tx = self._tx;
	var store = tx.objectStore(self._name);
	var req = store.getAll();
	req.onsuccess = function () {
		deferred.resolve(req.result);
	};
	req.onerror = function () {
		deferred.reject();
	};
	return deferred.promise();
};

var emptyFn = function () {};

Store.prototype.cursorByIndex = function (indexName, value, options) {
	options = options || {};
	var self = this;
	var tx = self._tx;
	var store = tx.objectStore(self._name);
	var index = store.index(indexName);
	var req = index.openCursor(IDBKeyRange.only(value), "next");
	var onsuccess = options.success || emptyFn;
	var onerror = options.error || emptyFn;
	req.onsuccess = function (e) {
		onsuccess.call(self, req.result);
	};
	req.onerror = function (err) {
		onerror.call(self, err);
	};
};

} ());



/******************************** bellow O/I Mapping ********************************/


var Repository;

(function () {

/**
 * @param {Array} itemsInMemory [i/o]
 * @param {String} storeName
 * @param {Function} constructor
 * @param {Transaction} tx
 */
var Collection = function (itemsInMemory, storeName, constructor, tx) {
  this._storeName = storeName;
  this._constructor = constructor;
  this._items = itemsInMemory;
  this._tx = tx;
};

Collection.prototype.find = function (tx, key) {
  var self = this;
  var d;
  if (key in self._items) {
   	d = new $.Deferred();
   	setTimeout(function () {
	  d.resolve(self._items[key]);
	}, 0);
	return d.promise();
  } else {
  	return self.load(tx, key);
  }
};

Collection.prototype.save = function (model, options) {
  var self = this;
  var deferred = new $.Deferred();
  var data = model.getData();
  var req = self._tx.store(self._storeName).save(data, options);

  req.done(function () {
  	if (!data.key in self._items) {
	    self._items[data.key] = model;
	}
    deferred.resolve(model);
  });

  req.fail(function (err) {
    deferred.reject(err);
  });

  return deferred.promise();
};

Collection.prototype.load = function (key, f) {
  var self = this;
  var deferred = new $.Deferred();
  var req = self._tx.store(self._storeName).find(key);

  req.done(function (data) {
    var model = new self._constructor(data);
    self._items[key] = model;
	f.call(self, model);
    deferred.resolve();
  });

  req.fail(function (err) {
    deferred.reject(err);
  });

  return deferred.promise();
};

Collection.prototype.eachByIndex = function (indexName, value, f) {
  var self = this;
  var constructor = this._constructor;
  var deferred = new $.Deferred();
  var req = self._tx.store(self._storeName).cursorByIndex(indexName, value, {
  	success: function (cursor) {
		if (cursor) {
			var key = cursor.primaryKey, 
			    data = cursor.value,
			    model;
			if (key in self._items) {
				model = self._items[key];
				model.setData(data);
			} else {
				model = self._items[key] = new constructor(data);
			}
			f.call(self, model);
			cursor.continue();
		} else {
			deferred.resolve();
		}
	},
	error: function (err) {
		deferred.reject(err);
	}
  });
  
  return deferred.promise();
};


//export
Repository = function (collectionConfig) {
  var self = this;
  self._conn = new DatabaseConnection();
  self._collectionConfig = collectionConfig;
  self._collectionCache = {};
  $.each(collectionConfig, function (name) {
	  self._collectionCache[name] = [];
  });
};

Repository.prototype.open = function () {
  return this._conn.open();
};

Repository.prototype.read = function () {
	var collectionNames = Array.prototype.slice.call(arguments, 0, arguments.length - 1),
	    callback = arguments[arguments.length - 1];
	return this._transaction('readonly', collectionNames, callback);
};

Repository.prototype.readwrite = function () {
	var collectionNames = Array.prototype.slice.call(arguments, 0, arguments.length - 1),
	    callback = arguments[arguments.length - 1];
	return this._transaction('readwrite', collectionNames, callback);
};

Repository.prototype._transaction = function (mode, collectionNames, callback) {
	var self = this,
	    objectStoreNames = collectionNames,
	    tx,
	    collections;
	tx = self._conn.transaction(objectStoreNames, mode);
	collections = {};
	$.each(collectionNames, function (i, name) {
		collections[name] = new Collection(self._collectionCache[name], name, self._collectionConfig[name], tx);
	});
	callback.apply(collections, []);
};


} ());