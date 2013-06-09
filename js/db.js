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
	var dbName = "test1", version = 3;

	var reqOpen = indexedDB.open(dbName, version);

	function upgrade (db, newVersion, oldVersion) {
		//TODO: 外に出す
		//db.createObjectStore('productions', {keyPath: 'id', autoIncrement: false});
		var activityStore = db.createObjectStore('activities', {keyPath: 'id', autoIncrement: false});
		activityStore.createIndex('productionId', 'productionId', {unique: false});
		var docStore = db.createObjectStore('documents', {keyPath: 'id', autoIncrement: false});
		docStore.createIndex('productionId', 'productionId', {unique: false});
	}

	reqOpen.onupgradeneeded = function (e) {
		var db = this.result;
		upgrade(db, version);
	};

	reqOpen.onsuccess = function (e) {
		var db = this.result;
		
		//for IE10
		if (!!db.setVersion) {
			db.setVersion(version).onsuccess = function () {
				upgrade(db, version);
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

DatabaseConnection.prototype.store = function (name) {
	return new Store(this._db, name);
}

function Store(db, name) {
	this._db = db;
	this._name = name;
}

Store.prototype.save = function (data, options) {
	options = options || {};
	var self = this;
	var deferred = new Deferred(function () {this.done(options.success); this.fail(options.error); });
	var db = self._db;
	var tx = options.transaction || db.transaction([self._name], 'readwrite');
	tx.oncomplete = function () {
		deferred.resolve();
	};
	tx.onerror = function () {
		deferred.reject();
	};
	var store = tx.objectStore(self._name);
	store.put(data);
	return deferred.promise();
};

Store.prototype.find = function (key, options) {
	options = options || {};
	var self = this;
	var deferred = new Deferred(function () {this.done(options.success); this.fail(options.error); });
	var db = self._db;
	var tx = options.transaction || db.transaction([self._name], 'readonly');
	tx.oncomplete = function () {
		deferred.resolve(reqGet.result);
	};
	tx.onerror = function () {
		deferred.reject();
	};
	var store = tx.objectStore(self._name);
	var reqGet = store.get(key);
	return deferred.promise();
};
} ());

var Repository;

(function () {
/********************************/
/* Generic Repository           */
/********************************/

/**
 * @param {DatabaseConnection} conn
 * @param {String} storeName
 * @param {Function} constructor
 */
var Collection = function (conn, storeName, constructor) {
  this._conn = conn;
  this._storeName = storeName;
  this._constructor = constructor;
  this._items = [];
};

Collection.prototype.find = function (key) {
  var self = this;
  var d;
  if (key in self._items) {
   	d = new $.Deferred();
   	setTimeout(function () {
	  d.resolve(self._items[key]);
	}, 0);
	return d.promise();
  } else {
  	return self.load(key);
  }
};

Collection.prototype.save = function (model, options) {
  var self = this;
  var deferred = new $.Deferred();
  var data = model.getData();
  var req = self._conn.store(self._storeName).save(data, options);

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

Collection.prototype.load = function (key) {
  var self = this;
  var deferred = new $.Deferred();
  var req = self._conn.store(self._storeName).find(key);

  req.done(function (data) {
    var model = new self._constructor(data);
    self._items[key] = model;
    deferred.resolve(model);
  });

  req.fail(function (err) {
    deferred.reject(err);
  });

  return deferred.promise();
};

//export
Repository = function (collections) {
  var self = this;
  var conn = new DatabaseConnection();
  self._conn = conn;

  $.each(collections, function (name, constructor) {
    self[name] = new Collection(conn, name, constructor);
  });
};

Repository.prototype.open = function () {
  return this._conn.open();
};

} ());