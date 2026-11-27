// Only for the isolated, disposable CI database. Never run on customer data.
const bcrypt = require('bcryptjs');
const {sequelize,User}=require('../src/models');
(async()=>{
  if(process.env.GITHUB_ACTIONS!=='true'||process.env.DB_NAME!=='pose_pics_ci'||process.env.DB_HOST!=='127.0.0.1'||!process.env.CI_BROWSER_PASSWORD) throw new Error('Refusing to create fixtures outside isolated GitHub CI');
  try {
    const hash=await bcrypt.hash(process.env.CI_BROWSER_PASSWORD,10);
    for(const role of ['admin','staff','client']) await User.findOrCreate({where:{email:`ci-${role}@example.invalid`},defaults:{name:`CI ${role}`,role,password_hash:hash,is_active:true}});
  } finally {await sequelize.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
