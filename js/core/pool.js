/**
 * 简易对象池：避免高频 instantiate/destroy 造成小游戏掉帧
 */
const __ = {
  poolDic: Symbol('poolDic'),
};

class Pool {
  constructor() {
    this[__.poolDic] = {};
  }

  getPoolBySign(name) {
    return this[__.poolDic][name] || (this[__.poolDic][name] = []);
  }

  getItemByClass(name, className) {
    const pool = this.getPoolBySign(name);
    return pool.length ? pool.shift() : new className();
  }

  recover(name, instance) {
    this.getPoolBySign(name).push(instance);
  }
}

module.exports = Pool;
