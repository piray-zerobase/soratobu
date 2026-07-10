/* =========================================================
   mockSupabase.mjs — supabase-js クライアントの偽物（from/select/eq/order/limit/rpcを模倣）
   js/store-supabase.js の読み取り関数（fetchXxx）をネットワーク無しで
   ユニットテストするためのヘルパー。RLSや実際のjoinは再現しない
   （行の絞り込みはトップレベルの列に対するeqのみ・ドット付き列＝
   埋め込みリソースへのフィルタは無視して素通しする）。
   ========================================================= */

function applyFilters(rows, filters){
  return filters.reduce((acc, [col, val]) => {
    if(col.includes(".")) return acc;   // 埋め込みリソースへのフィルタはモックでは未対応（素通し）
    return acc.filter(r => r[col] === val);
  }, rows);
}

function makeQueryBuilder(tableRows, errorMessage){
  let filters = [];
  let single = false;
  let sortCol = null, sortAsc = true;
  let limitN = null;

  const builder = {
    select(){ return builder; },
    eq(col, val){ filters.push([col, val]); return builder; },
    order(col, opts){ sortCol = col; sortAsc = !opts || opts.ascending !== false; return builder; },
    limit(n){ limitN = n; return builder; },
    maybeSingle(){ single = true; return builder; },
    then(resolve, reject){
      return Promise.resolve().then(() => {
        if(errorMessage) return { data: null, error: { message: errorMessage } };
        let rows = applyFilters([...tableRows], filters);
        if(sortCol){
          rows = rows.slice().sort((a, b) => {
            if(a[sortCol] === b[sortCol]) return 0;
            return (a[sortCol] > b[sortCol] ? 1 : -1) * (sortAsc ? 1 : -1);
          });
        }
        if(limitN != null) rows = rows.slice(0, limitN);
        return { data: single ? (rows[0] || null) : rows, error: null };
      }).then(resolve, reject);
    },
  };
  return builder;
}

/**
 * createMockSupabase({ tables, errors, rpcResponses })
 *  - tables: { doctors: [...], hospitals: [...], applications: [...], ... }
 *  - errors: { doctors: "メッセージ" } … そのテーブルへのfromクエリを常にエラーにする
 *  - rpcResponses: { rpc_name: { data, error } } … rpc()呼び出しの戻り値
 */
export function createMockSupabase({ tables = {}, errors = {}, rpcResponses = {} } = {}){
  const calls = { from: [], rpc: [] };
  const client = {
    from(table){
      calls.from.push(table);
      return makeQueryBuilder(tables[table] || [], errors[table]);
    },
    async rpc(name, args){
      calls.rpc.push({ name, args });
      const r = rpcResponses[name];
      if(!r) return { data: null, error: { message: `未定義のrpc: ${name}` } };
      return r;
    },
    auth: {
      async signUp(){ return { data: { user: { id: "u_mock" } }, error: null }; },
      async signInWithPassword(){ return { data: { user: { id: "u_mock" } }, error: null }; },
      async signOut(){ return { error: null }; },
    },
  };
  return { client, calls };
}
