
import inherits from 'inherits';
import Promise from '../../promise';
import Transaction from '../../transaction';
const debug = require('debug')('knex:tx')

import { assign } from 'lodash'

function Transaction_MSSQL() {
  Transaction.apply(this, arguments)
}
inherits(Transaction_MSSQL, Transaction)

assign(Transaction_MSSQL.prototype, {

  begin(conn) {
    debug('%s: begin', this.txid)
    return conn.tx_.begin()
      .then(this._resolver, this._rejecter)
  },

  savepoint(conn) {
    debug('%s: savepoint at', this.txid)
    return Promise.resolve()
      .then(() => this.query(conn, `SAVE TRANSACTION ${this.txid}`))
  },

  commit(conn, value) {
    this._completed = true
    debug('%s: commit', this.txid)
    return conn.tx_.commit()
      .then(() => this._resolver(value), this._rejecter)
  },

  release(conn, value) {
    return this._resolver(value)
  },

  rollback(conn, error) {
    this._completed = true
    debug('%s: rolling back', this.txid)
    return conn.tx_.rollback()
      .then(() => this._rejecter(error))
  },

  rollbackTo(conn, error) {
    debug('%s: rolling backTo', this.txid)
    return Promise.resolve()
      .then(() => this.query(conn, `ROLLBACK TRANSACTION ${this.txid}`, 2, error))
      .then(() => this._rejecter(error))
  },

  // Acquire a connection and create a disposer - either using the one passed
  // via config or getting one off the client. The disposer will be called once
  // the original promise is marked completed.
  acquireConnection(config) {
    const t = this
    const configConnection = config && config.connection
    return Promise.try(() => {
      return (t.outerTx ? t.outerTx.conn : null) ||
        configConnection ||
        t.client.acquireConnection().completed;
    }).tap(function(conn) {
      if (!t.outerTx) {
        t.conn = conn
        conn.tx_ = conn.transaction()
      }
    }).disposer(function(conn) {
      if (t.outerTx) return;
      if (conn.tx_) {
        if (!t._completed) {
          debug('%s: unreleased transaction', t.txid)
          conn.tx_.rollback();
        }
        conn.tx_ = null;
      }
      t.conn = null
      if (!configConnection) {
        debug('%s: releasing connection', t.txid)
        t.client.releaseConnection(conn)
      } else {
        debug('%s: not releasing external connection', t.txid)
      }
    })
  }

})

export default Transaction_MSSQL
