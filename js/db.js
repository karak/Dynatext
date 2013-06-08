var Database;

(function () {
var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB;
if (!indexedDB) alert('Your browser does not support indexeddb API!')
var IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction;
var IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange;
var Deferred = jQuery.Deferred; //dependency on jQuery; only jQuery.Deferred

Database = function () {
};

Database.prototype.open = function () {
	var deferred = new Deferred();
	var dbName = "test1", version = 2;

	var reqOpen = indexedDB.open(dbName, version);

	function upgrade (db, newVersion) {
		db.createObjectStore('productions', {keyPath: 'id', autoIncrement: false});
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
		deferred.resolve();
	};

	reqOpen.onerror = function (err) {
		deferred.reject();
	};

	function Collection() {
	}

	Collection.prototype.save = function (data, options) {
		options = options || {};
		var deferred = new Deferred(function () {this.done(options.success); this.fail(options.error); });
		var db = reqOpen.result;
		var tx = options.transaction || db.transaction(['productions'], 'readwrite');
		tx.oncomplete = function () {
			deferred.resolve();
		};
		tx.onerror = function () {
			deferred.reject();
		};
		var store = tx.objectStore('productions');
		store.put(data);
		return deferred.promise();
	};

	Collection.prototype.find = function (key, options) {
		options = options || {};
		var deferred = new Deferred(function () {this.done(options.success); this.fail(options.error); });
		var db = reqOpen.result;
		var tx = options.transaction || db.transaction(['productions'], 'readonly');
		tx.oncomplete = function () {
			deferred.resolve(reqGet.result);
		};
		tx.onerror = function () {
			deferred.reject();
		};
		var store = tx.objectStore('productions');
		var reqGet = store.get(key);
		return deferred.promise();
	};

	this.productions = new Collection();

	return deferred.promise();
}

} ());