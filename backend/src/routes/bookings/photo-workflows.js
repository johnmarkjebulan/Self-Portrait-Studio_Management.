const router = require('express').Router();
const { Appointment, PhotoWorkflow, User, Notification, ActivityLog } = require('../../models');
const { authenticate, requireStaffOrAdmin } = require('../../middleware/auth');
const { notifyAdmins } = require('../../utils/notifyAdmins');

const { STAGES, canTransition, isSafeGalleryUrl } = require('../../utils/photoWorkflow');
async function getBooking(id) { return Appointment.findByPk(id, { attributes: ['id','tracking_number','client_id','status'] }); }
async function result(apptId, user) {
  const workflow = await PhotoWorkflow.findByPk(apptId, { include: [{ model: User, as: 'photographer', attributes: ['id','name'] }] });
  if (!workflow) return { appointment_id: apptId, stage: 'awaiting_session', assigned_staff_id: null };
  const data = workflow.toJSON();
  if (user.role === 'client') {
    delete data.internal_notes;
    delete data.last_updated_by;
    if (data.stage !== 'released') data.gallery_url = null;
  }
  return data;
}
router.get('/:id', authenticate, async (req,res,next) => {
  try {
    const appt = await getBooking(req.params.id);
    if (!appt) return res.status(404).json({error:'Booking not found.'});
    if (req.user.role === 'client' && appt.client_id !== req.user.id) return res.status(403).json({error:'Access denied.'});
    res.json({ workflow: await result(appt.id, req.user) });
  } catch(e){ next(e); }
});
router.patch('/:id/assign', authenticate, requireStaffOrAdmin, async (req,res,next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only Admin can assign a photographer.' });
    const appt = await getBooking(req.params.id);
    if (!appt) return res.status(404).json({ error:'Booking not found.' });
    if (['cancelled', 'rejected', 'no_show'].includes(appt.status)) return res.status(409).json({error:'Cannot assign a cancelled booking.'});
    const staffId = req.body.staff_id || null;
    let selected = null;
    if (staffId) {
      selected = await User.findOne({ where: { id: staffId, role: 'staff', is_active: true }, attributes: ['id','name'] });
      if (!selected) return res.status(400).json({error:'Choose an active staff account.'});
    }
    const [workflow] = await PhotoWorkflow.findOrCreate({ where: { appointment_id: appt.id } });
    await workflow.update({ assigned_staff_id: staffId, last_updated_by: req.user.id });
    if (selected) {
      await Notification.create({ user_id: selected.id, title:'New Assigned Photo Session', message:`You are assigned to ${appt.tracking_number}.`, type:'booking', related_id:appt.id, related_type:'appointment' });
    }
    await ActivityLog.create({user_id:req.user.id,user_name:req.user.name,action:'STAFF_ASSIGNMENT',description:`Photographer ${selected?.name||'unassigned'} for ${appt.tracking_number}`,entity_type:'appointment',entity_id:appt.id,ip_address:req.ip});
    res.json({workflow:await result(appt.id,req.user)});
  } catch(e){next(e)}
});
router.patch('/:id/stage', authenticate, requireStaffOrAdmin, async (req,res,next) => {
  try {
    const appt = await getBooking(req.params.id);
    if (!appt) return res.status(404).json({error:'Booking not found.'});
    const newStage = String(req.body.stage || '');
    if (!STAGES.includes(newStage)) return res.status(400).json({error:'Invalid photo delivery stage.'});
    if (appt.status !== 'completed') return res.status(409).json({error:'Complete the photo session before editing and delivery.'});
    const [workflow] = await PhotoWorkflow.findOrCreate({where:{appointment_id:appt.id},defaults:{stage:'editing'}});
    if (req.user.role === 'staff' && workflow.assigned_staff_id !== req.user.id) return res.status(403).json({error:'Only the assigned photographer or Admin can update this job.'});
    if (newStage === 'released' && req.user.role !== 'admin') return res.status(403).json({error:'Only Admin can release final photos.'});
    if (!canTransition(workflow.stage, newStage, req.user.role)) return res.status(409).json({error:`Invalid photo stage: ${workflow.stage} → ${newStage}.`});
    let gallery = workflow.gallery_url;
    if (req.body.gallery_url !== undefined) {
      const raw = String(req.body.gallery_url || '').trim();
      if (!isSafeGalleryUrl(raw)) return res.status(400).json({error:'Use a valid HTTPS photo gallery link.'});
      gallery = raw || null;
    }
    if (newStage === 'released' && !gallery) return res.status(400).json({error:'Add an HTTPS gallery link before releasing photos.'});
    const data = { stage:newStage, last_updated_by:req.user.id, gallery_url:gallery };
    if (req.body.internal_notes !== undefined) data.internal_notes=String(req.body.internal_notes || '').slice(0,2000);
    if (newStage === 'ready_for_release') data.ready_at = new Date();
    if (newStage === 'released') data.released_at = new Date();
    await workflow.update(data);
    const messages = {
      ready_for_release: ['Photos Ready for Review', `Your photos for ${appt.tracking_number} are ready for final release. We will notify you when you can access them.`],
      released: ['Your Photos Are Ready!', `Your photo gallery for ${appt.tracking_number} is now available in My Bookings.`]
    };
    if (messages[newStage]) await Notification.create({user_id:appt.client_id,title:messages[newStage][0],message:messages[newStage][1],type:'booking',related_id:appt.id,related_type:'appointment'});
    if (newStage === 'ready_for_release') await notifyAdmins('Photo Delivery Ready', `${appt.tracking_number} is ready for Admin release.`, 'booking', appt.id, 'appointment');
    await ActivityLog.create({user_id:req.user.id,user_name:req.user.name,action:'PHOTO_DELIVERY',description:`${appt.tracking_number} photo stage ${newStage}`,entity_type:'appointment',entity_id:appt.id,ip_address:req.ip});
    res.json({workflow:await result(appt.id,req.user)});
  } catch(e){next(e)}
});
// The gallery URL may be edited before final release, without changing the stage.
router.patch('/:id/details', authenticate, requireStaffOrAdmin, async (req,res,next) => {
  try {
    const appt=await getBooking(req.params.id);
    if(!appt) return res.status(404).json({error:'Booking not found.'});
    const [workflow]=await PhotoWorkflow.findOrCreate({where:{appointment_id:appt.id}});
    if(req.user.role==='staff' && workflow.assigned_staff_id!==req.user.id) return res.status(403).json({error:'Only assigned staff or Admin can edit delivery details.'});
    if(workflow.stage==='released') return res.status(409).json({error:'Released galleries are locked; contact Admin to correct a release.'});
    const changes={last_updated_by:req.user.id};
    if(req.body.internal_notes!==undefined) changes.internal_notes=String(req.body.internal_notes||'').slice(0,2000);
    if(req.body.gallery_url!==undefined){
      const url=String(req.body.gallery_url||'').trim();
      if(!isSafeGalleryUrl(url)) return res.status(400).json({error:'Gallery link must start with HTTPS.'});
      changes.gallery_url=url||null;
    }
    await workflow.update(changes);
    res.json({workflow:await result(appt.id,req.user)});
  }catch(e){next(e)}
});
module.exports=router;
